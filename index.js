const express = require("express");
const axios = require("axios");
const fs = require("fs");
const https = require("https");
const { z } = require("zod");
const path = require("path");
require("dotenv").config();

const app = express();
app.use(express.json());

// 📂 Serve la cartella 'public' per la UI
app.use(express.static(path.join(__dirname, "public")));

/* ================================
   CONFIG DA ENV
================================ */
const PROXMOX_URL = process.env.PROXMOX_URL;
const TOKEN_ID = process.env.TOKEN_ID;
const TOKEN_SECRET = process.env.TOKEN_SECRET;
const NODE_NAME = process.env.NODE_NAME || "proxmox";

// Limiti di sicurezza dal tuo .env
const MAX_CORES = parseInt(process.env.MAX_CORES) || 10;
const MAX_RAM = parseInt(process.env.MAX_RAM) || 8192;
const MAX_DISK = parseInt(process.env.MAX_DISK) || 100;

// PARSING TEMPLATE: "9000:Ubuntu 22.04,9001:Debian 12" -> [{id: "9000", name: "Ubuntu 22.04"}]
const rawTemplates = process.env.TEMPLATES || "9000:Default Template";
const templatesList = rawTemplates.split(",").map(item => {
    const [id, name] = item.split(":");
    return { id: id.trim(), name: name.trim() };
});
const validTemplateIds = templatesList.map(t => t.id);

/* ================================
   AXIOS INSTANCE
================================ */
const api = axios.create({
  baseURL: PROXMOX_URL,
  headers: { Authorization: `PVEAPIToken=${TOKEN_ID}=${TOKEN_SECRET}` },
  httpsAgent: new https.Agent({ rejectUnauthorized: false })
});

/* ================================
   VALIDAZIONE (Versione Compatibile)
=============================== */
const ipRegex = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/;

const schema = z.object({
  template: z.string().refine(id => validTemplateIds.includes(id), "ID Template non valido"),
  name: z.string().min(3).max(20),
  user: z.string().min(3).max(20),
  authType: z.enum(["ssh", "password"]), // Nuovo campo
  sshkey: z.string().optional(),    // Diventa opzionale qui...
  password: z.string().optional(),  // ...e anche qui
  cores: z.number().min(1).max(MAX_CORES),
  ram: z.number().min(512).max(MAX_RAM),
  disk: z.number().min(5).max(MAX_DISK),
  ip: z.string().regex(ipRegex, "Indirizzo IP non valido"),
  gateway: z.string().regex(ipRegex, "Gateway non valido")
}).refine(data => {
  if (data.authType === 'ssh') {
    return data.sshkey && data.sshkey.length >= 50;
  }
  if (data.authType === 'password') {
    return data.password && data.password.length >= 6;
  }
  return false;
}, { 
  message: "Dati di autenticazione mancanti o non validi (SSH min 50 caratteri, Password min 6)"
});

/* ================================
   HELPERS
================================ */

// Funzione per controllare se l'IP è già nei log
function isIpUsed(ip) {
  if (!fs.existsSync("vm-creations.log")) return false;
  const logs = fs.readFileSync("vm-creations.log", "utf8");
  return logs.includes(`IP: ${ip}`);
}

async function getNextVMID() {
  const res = await api.get("/cluster/nextid");
  return res.data.data;
}

async function waitTaskCompletion(upid) {
  console.log("⏳ Waiting for Proxmox task...");
  while (true) {
    const res = await api.get(`/nodes/${NODE_NAME}/tasks/${upid}/status`);
    if (res.data.data.status === "stopped") {
      console.log("✅ Task finished");
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/* ================================
   ROUTING
================================ */

// NUOVO: Invia la configurazione alla UI (template e limiti)
app.get("/config", (req, res) => {
    res.json({
        templates: templatesList,
        limits: {
            cores: MAX_CORES,
            ram: MAX_RAM,
            disk: MAX_DISK
        }
    });
});

// Endpoint creazione VM
app.post("/create", async (req, res) => {
  try {
    const data = schema.parse(req.body);
    const vmid = await getNextVMID();

    // 🛡️ CHECK IP DUPLICATO
    if (isIpUsed(data.ip)) {
      return res.status(400).json({ error: "L'indirizzo IP è già stato assegnato a un'altra VM nei log." });
    }

    console.log(`🚀 Start Provisioning: VM ${vmid} (${data.name})`);

    // 1️⃣ CLONE
    const cloneRes = await api.post(`/nodes/${NODE_NAME}/qemu/${data.template}/clone`, {
      newid: vmid,
      name: data.name,
      full: 0
    });
    await waitTaskCompletion(cloneRes.data.data);

    // ⏳ Lock resolution
    await sleep(2000);

    // 2️⃣ RESIZE
    console.log(`💾 Resizing disk to ${data.disk}G...`);
    await api.put(`/nodes/${NODE_NAME}/qemu/${vmid}/resize`, {
      disk: "scsi0",
      size: `${data.disk}G`
    });

    // 3️⃣ CONFIGURATION
    const configParams = {
      cores: data.cores,
      sockets: 1,
      memory: data.ram,
      ciuser: data.user,
      ipconfig0: `ip=${data.ip}/24,gw=${data.gateway}`
    };

    configParams.sshkeys = encodeURIComponent(data.sshkey);
 

    await api.post(`/nodes/${NODE_NAME}/qemu/${vmid}/config`, configParams);
    await api.post(`/nodes/${NODE_NAME}/qemu/${vmid}/status/start`);

    // 4️⃣ START
    console.log("🟢 Starting VM...");
    await api.post(`/nodes/${NODE_NAME}/qemu/${vmid}/status/start`);

    // LOG SU FILE
    fs.appendFileSync(
      "vm-creations.log",
      `${new Date().toISOString()} - VM ${vmid} CREATED - Name: ${data.name}, IP: ${data.ip}\n`
    );

    console.log(`🎉 VM ${vmid} is UP at ${data.ip}`);
    res.json({ success: true, vmid, ip: data.ip });

  } catch (err) {
    // Logging dettagliato come lo avevi prima
    const errorData = err.response?.data || err.message;
    console.error("❌ ERROR DETAILS:", errorData);
    
    res.status(500).json({
      success: false,
      error: errorData
    });
  }
});

// 1. Endpoint per leggere la lista dal log
app.get("/list", (req, res) => {
    if (!fs.existsSync("vm-creations.log")) return res.json([]);
    const logs = fs.readFileSync("vm-creations.log", "utf8")
        .split("\n")
        .filter(line => line.trim() !== "")
        .map(line => {
            // Estrae ID, Nome e IP con una regex semplice
            const match = line.match(/VM (\d+) \(([^)]+)\) created|VM (\d+) CREATED - Name: ([^,]+), IP: ([\d.]+)/);
            if (match) {
                return {
                    vmid: match[1] || match[3],
                    name: match[2] || match[4],
                    ip: match[5] || "N/A",
                    date: line.split(" - ")[0]
                };
            }
            return null;
        })
        .filter(item => item !== null)
        .reverse(); // Mostra le ultime create in alto
    res.json(logs);
});

// 2. Endpoint per eliminare una VM
app.delete("/delete/:vmid", async (req, res) => {
    const vmid = req.params.vmid;
    try {
        console.log(`🗑️ Deleting VM ${vmid}...`);
        // Ferma la VM (force stop)
        await api.post(`/nodes/${NODE_NAME}/qemu/${vmid}/status/stop`);
        // Attendi un attimo che si fermi
        await sleep(2000);
        // Elimina
        await api.delete(`/nodes/${NODE_NAME}/qemu/${vmid}`);
        
        // 3. Rimuovi la riga corrispondente dal file di log
        if (fs.existsSync("vm-creations.log")) {
            const logs = fs.readFileSync("vm-creations.log", "utf8").split("\n");
            
            // Filtra via le righe che contengono il VMID specifico
            const updatedLogs = logs.filter(line => !line.includes(`VM ${vmid}`));
            
            fs.writeFileSync("vm-creations.log", updatedLogs.join("\n"));
            console.log(`🧹 Cleaning logs for VM ${vmid}`);
        }

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.response?.data || err.message });
    }
});

// Health Check
app.get("/health", async (req, res) => {
  try {
    await api.get("/cluster/status");
    res.json({ status: "ok", node: NODE_NAME });
  } catch {
    res.status(500).json({ status: "proxmox unreachable" });
  }
});

 // If this port is occupied by another process you can change it from here.
app.listen(3000, "0.0.0.0", () => {
  console.log("🚀 Provisioning Engine running on port 3000");
});