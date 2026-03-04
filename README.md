# Proxmox Cloud-Init Provisioner 🚀

A super-lightweight Node.js web interface to rapidly deploy Proxmox VMs using Cloud-Init templates. Perfect for lab environments or small-scale VPS hosting or fun testing.
I just wanted to test the Proxmox api and try out Gemini coding.

I AM NOT AN EXPERT PROGRAMMER SO THIS APP CERTAINLY WILL HAVE SOME BUGS, BUT AS FAR AS I HAVE TESTED IT, IT CAN CREATE AND RUN VMS, AND DELETE THEM. IT DOESN'T REALLY HAVE FULL ERROR LOG FUNCTIONS.

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
First you need to download the cloud-init image, i will use ubuntu as an example but it works with pretty much all cloud-init images

Download the template on your proxmox host
wget https://cloud-images.ubuntu.com/noble/current/noble-server-cloudimg-amd64.img or Debian if you like wget https://cloud.debian.org/images/cloud/bookworm/latest/debian-12-genericcloud-amd64.qcow2

1. Create the vm
qm create 9000 --name ubuntu-template --memory 2048 --cores 2 --net0 virtio,bridge=vmbr0,rate=12 (rate is in MB/s 12 is around 100mbps, if you get errors just remove ,rate=12 you can always set that on the template once is created from Proxmox gui)

2. Import disk from img or qcow
qm importdisk 9000 noble-server-cloudimg-amd64.img local-lvm

3. Connect the disk to the vm
qm set 9000 --scsihw virtio-scsi-pci --scsi0 local-lvm:vm-9000-disk-0

4. Add cloud-init boot disk
qm set 9000 --ide2 local-lvm:cloudinit

5. Boot order
qm set 9000 --boot order=scsi0


6. Serial console, is optional and not needed cause we are setting up ssh keys, but maybe if you want to use password you can set it manually 
qm set 9000 --serial0 socket --vga serial0

7. Convert into template
qm template 9000

8. Password
If you will ever need to access via console with password you can use this command , after a certain vm is created
qm set 210 --cipassword "yourpassword" - as you can see you need to use the VM ID generated from the tool and apply this from the host.

## 🚀 Installation

1. Clone the repo:
   ```bash
   git clone [https://github.com/youruser/proxmox-provisioner.git](https://github.com/youruser/proxmox-provisioner.git)
   cd proxmox-provisioner

2. Install dependencies
npm install

3. Configure .env file
cp .env.example .env
# Edit .env with your Proxmox credentials and template IDs

4. Start the server
node index.js

If everything went right you should reach the server on your server on port 3000

