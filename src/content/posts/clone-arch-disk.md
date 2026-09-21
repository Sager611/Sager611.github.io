---
title: "Cloning Arch Linux hard disk remotely to new machine"
description: "I recently bought a new laptop with Windows 11 and wanted to migrate my whole hard drive contents from my old laptop with an Arch Linux installation. Follow this tutorial if you want to clone your old laptop’s hard drive to your new laptop’s hard drive via SSH in the same local network."
date: "2023-03-07T14:51:07+01:00"
tags: []
---

I recently bought a new laptop with Windows 11 and wanted to migrate my whole hard drive contents from my old laptop with an Arch Linux installation.

Follow this tutorial if you want to clone your old laptop’s hard drive to your new laptop’s hard drive via SSH in **the same local network**.

> [!note]- Table of Contents
>
> - [Boot from Live USB](#boot-from-live-usb)
> - [Setup SSH](#setup-ssh)
> - [Clone hard disk via SSH](#clone-hard-disk-via-ssh)

Boot from Live USB
------------------

In our **new** machine we will run all commands from a live USB Arch Linux image.

Follow [the official Arch Linux tutorial to boot an Arch Linux image from an USB](https://wiki.archlinux.org/title/USB_flash_installation_medium).

Once you have your live USB, plug it in your **new** laptop and go to the boot menu.

In my case, I have a Thinkpad and I had to press `enter` and then `F12` when powering on the laptop.

I also had to [disable Secure Boot](https://learn.microsoft.com/en-us/windows-hardware/manufacture/desktop/disabling-secure-boot?view=windows-11) beforehand to boot from my live USB.

Make sure to connect to the same local wifi network in both machines before continuing.

Setup SSH
---------

The following commands are executed as root user.

Run `su` on your **old** machine to become root user.

1. Check IP address of **new** machine with `ip address`:

    ```sh
    root@archiso ~ # ip address
    
        <...>
    
    4: wlan0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc noqueue state UP group default qlen 1000
        link/ether a0:59:50:e1:5f:9b brd ff:ff:ff:ff:ff:ff
        inet 192.168.1.76/24 metric 600 brd 192.168.1.255 scope global dynamic wlan0
           valid_lft 39244sec preferred_lft 39244sec
        inet6 fe80::a259:50ff:fee1:5f9b/64 scope link
           valid_lft forever preferred_lft forever
    ```

    Our local ip in this example is `192.168.1.76`.

2. Start ssh service in **new** machine:

    ```sh
    systemctl start sshd.service
    ```

3. Set the `root` password with `passwd`. Simply run `passwd` in your **new** machine.

4. Now we setup ssh so it [doesn’t ask for password when connecting to our new machine](https://www.pragmaticlinux.com/2021/05/configure-ssh-for-login-without-a-password/). In your **old** machine:

    ```shell
    ssh-keygen -t ed25519
    ssh-copy-id -i .ssh/id_thinkpadp15.pub root@192.168.1.76
    ```

    In my case it looks like:

    ```shell
    [root@thinkpad-t440s ~]$ ssh-keygen -t ed25519
    Generating public/private ed25519 key pair.
    Enter file in which to save the key (/home/saheru/.ssh/id_ed25519): .ssh/id_thinkpadp15
    Enter passphrase (empty for no passphrase):
    Enter same passphrase again:
    Your identification has been saved in .ssh/id_thinkpadp15
    Your public key has been saved in .ssh/id_thinkpadp15.pub
    The key fingerprint is:
    SHA256:DJ74VMCmqQ6nB//xZkPhSmPZRR00lVqskcZ2TH5N5wc saheru@thinkpad-t440s
    The key's randomart image is:
    +--[ED25519 256]--+
    |     ..  ++Bo.E o|
    |      o.. Bo*  =.|
    |     +...o *. . +|
    |    oo.=. o  .  .|
    |   ..++oS        |
    |o o =o+          |
    | B o.+.          |
    |. + .o+          |
    | . ..o..         |
    +----[SHA256]-----+
    [root@thinkpad-t440s ~]$ ssh-copy-id -i .ssh/id_thinkpadp15.pub root@192.168.1.76
    ```

    Note that I named my key `.ssh/id_thinkpadp15`.

    The last command will ask for the `root` password, which is the one we have set in the previous step.

5. Append your new machine’s IP with the corresponding private key in your **old** machine’s `.ssh/config` (create the file if it doesn’t exist), in my case:

    ```fallback
    Host 192.168.1.76
      HostName 192.168.1.76
      User root
      IdentityFile ~/.ssh/id_thinkpadp15
    ```

    Now ssh won’t prompt for a password when we connect to our new machine.

Clone hard disk via SSH
-----------------------

We will use the `dd` command from `coreutils` and `ssh` to remotely clone our hard disk from our **old** machine to our **new** machine.

> Check [the official Arch wiki for more info on cloning with `dd`](https://wiki.archlinux.org/title/Dd#Disk_cloning_and_restore).

The following commands completely erase the **new** machine’s hard disk contents! Make sure to save a backup image.

First, make sure you have enough space in your new hard disk. You can check this by running `lsblk` on your old and new machines.

Also make sure your hard disk in your **new** machine is unmounted with `lsblk` (`MOUNTPOINTS` should be empty).

In my case the hard disk in my **new** machine was `nvme0n1`. Make sure you choose the correct disk by looking at `SIZE` in `lsblk`.

To avoid corrupting files during cloning, you should run the following command from another live USB in your **old** machine and make sure your hard drive `sda` is unmounted.

Run the following in your **old** machine to clone the disk:

```sh
dd if=/dev/sda | ssh root@192.168.1.76 dd of=/dev/nvme0n1 status=progress
```

Change the IP, and `sda` and `nvme0n1` according to your source and destination disk names.

It will take 5-10h to clone a 512GB SSD. Once it finishes, you will have copied all the contents from your old machine to your new machine, including [GRUB](https://wiki.archlinux.org/title/GRUB) and [LUKS](https://wiki.archlinux.org/title/Dm-crypt/Encrypting_an_entire_system) (also with logical volumes) if you had them setup.
