#!/bin/bash

# Update system
sudo apt update && sudo apt upgrade -y

# Install required packages
sudo apt install -y \
    apt-transport-https \
    ca-certificates \
    curl \
    gnupg \
    lsb-release \
    ufw

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Start Docker
sudo systemctl start docker
sudo systemctl enable docker

# Configure firewall
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 8081/tcp
sudo ufw --force enable

# Create app directory
mkdir -p ~/app
cd ~/app

# Copy application files here
# (You'll need to manually SCP your files or use git clone)

# Start the application
sudo docker-compose -f docker-compose.prod.yml up -d --build

echo "Deployment complete! Please ensure you've copied your application files to ~/app/"
echo "Your server is now running with the following ports open:"
echo "- Port 80 (HTTP/Web Interface)"
echo "- Port 8081 (TCP Server)"
echo "- Port 22 (SSH)" 