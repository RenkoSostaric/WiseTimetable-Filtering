const express = require('express');
const app = express();
const ejs = require('ejs');
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const { get } = require('http');

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.get('/', (req, res) => {
  res.render('index');
});

app.get('/get-data', async (req, res) => {
  const url = req.query.url;
  const filePath = await getNewIcalFile(url);
  const events = parseICalFile(filePath);
  const globalGroups = getGlobalGroups(events);
  const subjectGroups = getSubjectGroups(events);
  res.render('filters', { globalGroups, subjectGroups });
});
app.listen(3000, () => {
  console.log('Server running on port 3000');
});

async function getNewIcalFile(url) {
  const filePath = path.join(__dirname, 'temp', 'calendar.ics');
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  const client = await page.target().createCDPSession()
  if (fs.existsSync(filePath))
    fs.unlinkSync(filePath);
  await client.send('Page.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: path.join(__dirname, 'temp'),
  })
  await page.goto(url, { waitUntil: 'networkidle0' });
  const btnId = String(await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    for (let button of buttons) {
      const span = button.querySelector('span');
      if (span && span.innerText === 'iCal-vse')
        return button.id;
    }
  }));
  await page.click(`#${btnId.replace(':', '\\:')}`);
  while (!fs.existsSync(filePath)) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser.close();
  return String(filePath);
}

function getGlobalGroups(events) {
  let globalGroups = new Set(events.map(event => event.group).sort());
  console.log(globalGroups);
  return globalGroups;
}

function getSubjectGroups(events) {
  let subjectGroupPairs = events.map(event => [event.subject, event.group]);
  let subjectGroups = subjectGroupPairs.reduce((accumulator, [key, value]) => {
    if (accumulator[key]) {
      if (!accumulator[key].includes(value))
        accumulator[key].push(value);
    } else {
      accumulator[key] = [value];
    }
    return accumulator;
  }, {});
  for (let key in subjectGroups) {
    subjectGroups[key].sort();
  }
  console.log(subjectGroups);
  return subjectGroups;
}

function parseICalFile(filePath) {
  const icalString = fs.readFileSync(filePath, 'utf8');
  const regex = /BEGIN:VEVENT\r\nUID:(.+)\r\nLOCATION:(.+)\r\nDTSTART:(.+)\r\nDTSTAMP:(.+)\r\nDTEND:(.+)\r\nSUMMARY:(.+)\r\nDESCRIPTION:((.+?)(?:,.+){2,3}, (.+))\r\nEND:VEVENT\r\n/g;
  let matches = icalString.matchAll(regex);
  let events = [];
  for (let match of matches) {
    events.push({
      UID: match[1],
      LOCATION: match[2],
      DTSTART: match[3],
      DTSTAMP: match[4],
      DTEND: match[5],
      SUMMARY: match[6],
      DESCRIPTION: match[7],
      subject: match[8],
      group: match[9]
    });
  }
  return events;
}