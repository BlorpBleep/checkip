const express = require('express');
const axios = require('axios');
const ipaddr = require('ipaddr.js');
const fs = require('fs');
const path = require('path');
const locationApp = require('./location');
require('dotenv').config();

const app = express();
app.set('trust proxy', 1); // Set trust proxy to true

let allowedIPs = [];

let isFetchingIPs = false; // Flag to track ongoing fetch

// Function to fetch location data from GeoIP API
const fetchLocationData = async (ip) => {
  const GEOIP_API_KEY = process.env.GEOIP_API_KEY; // Load the API key from .env file
  const GEOIP_API_URL = `https://api.ipgeolocation.io/ipgeo?apiKey=${GEOIP_API_KEY}&ip=`;

  try {
    const response = await axios.get(`${GEOIP_API_URL}${ip}`);
    return response.data;
  } catch (error) {
    console.error(`Error fetching location data: ${error}`);
    return null;
  }
};

// Fetch allowed IP addresses from API every 30 minutes
const fetchAllowedIPs = async () => {
  isFetchingIPs = true;
  try {
    const response = await axios.get('https://api.unblockvpn.io/app/v1/relays');
    const data = response.data;
    console.log(`First 200 characters of data: ${JSON.stringify(data).substring(0, 200)}`);
    
    // Extract IPs from openvpn.relays and wireguard.relays
    const openvpnRelays = data.openvpn.relays.map(relay => relay.ipv4_addr_in);
    const wireguardRelays = data.wireguard.relays.map(relay => relay.ipv4_addr_in);
    allowedIPs = [...openvpnRelays, ...wireguardRelays];
    
    // Remove duplicates
    allowedIPs = [...new Set(allowedIPs)];

    console.log(`Updated allowed IPs: ${allowedIPs.join(', ')}`);
  } catch (error) {
    console.error(`Error fetching allowed IPs: ${error}`);
    // If fetching fails, attempt to read from backup file
    try {
      const backupData = fs.readFileSync(path.resolve(__dirname, '..', 'relays.json'), 'utf8');
      const backupJSON = JSON.parse(backupData);
      
      // Extract IPs from openvpn.relays and wireguard.relays in the backup file
      const openvpnRelays = backupJSON.openvpn.relays.map(relay => relay.ipv4_addr_in);
      const wireguardRelays = backupJSON.wireguard.relays.map(relay => relay.ipv4_addr_in);
      allowedIPs = [...openvpnRelays, ...wireguardRelays];
      
      // Remove duplicates
      allowedIPs = [...new Set(allowedIPs)];

      console.log(`Using backup IPs: ${allowedIPs.join(', ')}`);
    } catch (backupError) {
      console.error(`Error reading backup IPs: ${backupError}`);
      // If both API fetch and backup file read fail, set allowedIPs to empty array
      allowedIPs = [];
    }
  } finally {
    isFetchingIPs = false;
  }
};

fetchAllowedIPs(); // Initial fetch on startup

setInterval(fetchAllowedIPs, 30 * 60 * 1000); // 30 minutes

app.get('/check-ip', async (req, res) => {
  const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.ip;
  console.log(`Incoming request from IP: ${clientIp}`);
  
  const isLocalRequest = clientIp === '127.0.0.1' || clientIp === '::1';
  
  if (isLocalRequest) {
    console.log('Local request detected. Bypassing IP check.');
    res.send(`You are protected. Allowed IPs: ${allowedIPs.join(', ')}`);
  } else {
    if (isFetchingIPs) {
      // IPs are being fetched, send a temporary message
      console.log('Allowed IPs are being updated. Please try again later.');
      res.send('Allowed IPs are being updated. Please try again later.');
    } else {
      try {
        const parsedIp = ipaddr.parse(clientIp).toString();
        if (parsedIp && ipaddr.IPv4.isValid(parsedIp) && Array.isArray(allowedIPs)) {
          const locationData = await fetchLocationData(parsedIp);
          const locationInfo = locationData ? `, located in ${locationData.city}, ${locationData.country_name}` : '';
          
          if (allowedIPs.includes(parsedIp)) {
            console.log(`IP ${parsedIp} is allowed`);
            res.send(`Protected by CicadaVPN! Your IP is ${parsedIp}${locationInfo}. Allowed IPs: ${allowedIPs.join(', ')}`);
          } else {
            console.log(`IP ${parsedIp} is not allowed`);
            console.log(`Allowed IPs: ${allowedIPs.join(', ')}`);
            res.send(`Not using CicadaVPN - Your IP is ${parsedIp}${locationInfo}. Allowed IPs: ${allowedIPs.join(', ')}`);
          }
        } else {
          console.error('Allowed IPs is not an array or parsedIp is not valid.');
          res.send('Error processing your IP.');
        }
      } catch (error) {
        console.error(`Error parsing IP: ${error}`);
        res.send('Error processing your IP.');
      }
    }
  }
});

// Integrate locationApp
app.use('/location', locationApp);

