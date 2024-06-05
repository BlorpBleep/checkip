const express = require('express');
const axios = require('axios');
const ipaddr = require('ipaddr.js');
require('dotenv').config();

const app = express();
app.set('trust proxy', 1); // Set trust proxy to true

const GEOIP_API_KEY = process.env.GEOIP_API_KEY; // Load the API key from .env file
const GEOIP_API_URL = `https://api.ipgeolocation.io/ipgeo?apiKey=${GEOIP_API_KEY}&ip=`;

// Function to fetch location data from GeoIP API
const fetchLocationData = async (ip) => {
  try {
    const response = await axios.get(`${GEOIP_API_URL}${ip}`);
    return response.data;
  } catch (error) {
    console.error(`Error fetching location data: ${error}`);
    return null;
  }
};

app.get('/check-ip', async (req, res) => {
  const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.ip;
  console.log(`Incoming request from IP: ${clientIp}`);
  
  try {
    const parsedIp = ipaddr.parse(clientIp).toString();
    if (parsedIp && ipaddr.IPv4.isValid(parsedIp)) {
      const locationData = await fetchLocationData(parsedIp);
      if (locationData) {
        const { city, country_name } = locationData;
        console.log(`IP ${parsedIp} is located in ${city}, ${country_name}`);
        res.send(`Your IP is ${parsedIp}, located in ${city}, ${country_name}.`);
      } else {
        console.error('Failed to fetch location data.');
        res.send(`Your IP is ${parsedIp}. Failed to fetch location data.`);
      }
    } else {
      console.error('Parsed IP is not valid.');
      res.send('Error processing your IP.');
    }
  } catch (error) {
    console.error(`Error parsing IP: ${error}`);
    res.send('Error processing your IP.');
  }
});

module.exports = app;
