Nessun problema, a volte i blocchi di codice si "rompono" a seconda di come l'editor li interpreta quando fai copia-incolla.

Ho unificato tutti i comandi in blocchi `bash` puliti e continui. Puoi copiare **tutto il blocco qui sotto** (cliccando sul tastino "Copia" in alto a destra se sei da browser) e incollarlo direttamente nel tuo file `README.md`:

```markdown
# Proxmox Cloud-Init Provisioner 🚀

A super-lightweight Node.js web interface to rapidly deploy Proxmox VMs using Cloud-Init templates. Perfect for lab environments or small-scale VPS hosting or fun testing.
I just wanted to test the Proxmox api and try out Gemini coding.

> **Note:** I AM NOT AN EXPERT PROGRAMMER SO THIS APP CERTAINLY WILL HAVE SOME BUGS, BUT AS FAR AS I HAVE TESTED IT, IT CAN CREATE AND RUN VMS, AND DELETE THEM. IT DOESN'T REALLY HAVE FULL ERROR LOG FUNCTIONS.

## ✨ Features
- **Dynamic Templates:** Configure your templates directly in the `.env` file.
- **Auto-Provisioning:** Automatic VMID selection, cloning, and resizing.
- **IP Management:** Prevents IP conflicts by checking a local creation log.
- **Resource Limits:** Enforce CPU, RAM, and Disk limits via configuration.
- **SSH Only:** Secure by default, using SSH public keys for admin access.
- **Bandwidth Shaping:** At the moment i modify the rate on my vmbr0 from the template i created , then i just modify the rate once the vm is up and running according to the need of the user.

## 🛠️ Prerequisites
1. A Proxmox Node with **Cloud-Init** ready templates.
2. An API Token (ID and Secret) with appropriate permissions.
3. Node.js installed on your server.
4. If you are not familiar with templates on Proxmox you can follow this simple guide on how to create a template ready for you to clone.

## 🛠️ Quick template creation guide
First you need to download the cloud-init image, i will use ubuntu as an example but it works with pretty much all cloud-init images.

Download the template on your proxmox host:
```bash
wget [https://cloud-images.ubuntu.com/noble/current/noble-server-cloudimg-amd64.img](https://cloud-images.ubuntu.com/noble/current/noble-server-cloudimg-amd64.img)

# Or Debian if you like:
# wget [https://cloud.debian.org/images/cloud/bookworm/latest/debian-12-genericcloud-amd64.qcow2](https://cloud.debian.org/images/cloud/bookworm/latest/debian-12-genericcloud-amd64.qcow2)

```

Run these commands on your Proxmox shell to build the template:

```bash
# 1. Create the vm (rate is in MB/s, 12 is around 100mbps. If you get errors just remove ,rate=12)
qm create 9000 --name ubuntu-template --memory 2048 --cores 2 --net0 virtio,bridge=vmbr0,rate=12

# 2. Import disk from img or qcow
qm importdisk 9000 noble-server-cloudimg-amd64.img local-lvm

# 3. Connect the disk to the vm
qm set 9000 --scsihw virtio-scsi-pci --scsi0 local-lvm:vm-9000-disk-0

# 4. Add cloud-init boot disk
qm set 9000 --ide2 local-lvm:cloudinit

# 5. Boot order
qm set 9000 --boot order=scsi0

# 6. Serial console (Optional, not needed for SSH but you can set it manually for password)
qm set 9000 --serial0 socket --vga serial0

# 7. Convert into template
qm template 9000

```

**8. Password Setup (Optional)**
If you will ever need to access via console with password you can use this command, after a certain vm is created:

```bash
qm set <VM_ID> --cipassword "yourpassword"

```

As you can see you need to use the VM ID generated from the tool and apply this from the host.

## 🚀 Installation

**1. Clone the repo:**

```bash
git clone [https://github.com/trapzero823/proxmox-deployer.git](https://github.com/trapzero823/proxmox-deployer.git)
cd proxmox-deployer

```

**2. Install dependencies:**

```bash
npm install

```

**3. Configure .env file:**

```bash
cp .env.example .env

```

*Edit the `.env` file with your Proxmox credentials and template IDs.*

**4. Start the server:**

```bash
node index.js

```

If everything went right you should reach the server on your server on port 3000. If needed you can change this on the `index.js` file.
