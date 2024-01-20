const express = require('express');
const app = express();
const ejs = require('ejs');
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer');
const uuidv4 = require('uuid').v4;
const session = require('express-session');

app.use(session({
  secret: uuidv4(),
  resave: false,
  saveUninitialized: true
}));
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use('/ical', express.static(path.join(__dirname, 'filters', 'ical')));
app.use(express.json());

app.get('/', (req, res) => {
  res.render('index');
});

app.get('/get-data', async (req, res) => {
  req.session.url = req.query.url;
  const filePath = await getNewIcalFile(req.session.url);
  req.session.events = parseICalFile(filePath);
  const globalGroups = getGlobalGroups(req.session.events);
  const subjectGroups = getSubjectGroups(req.session.events);
  res.render('filters', { globalGroups, subjectGroups });
});

app.post('/filter-data', async (req, res) => {
  const selectedGlobalGroups = new Set(req.body.globalGroups);
  const selectedSubjectGroups = req.body.subjectGroups;
  const filteredEvents = filterIcalEvents(req.session.events, selectedGlobalGroups, selectedSubjectGroups);
  const uniqueId = uuidv4();
  const destinationFilePath = path.join(__dirname, 'filters', 'ical', `${uniqueId}.ics`);
  generateNewIcalFile(filteredEvents, destinationFilePath);
  appendFilters(uniqueId, req.session.url, selectedGlobalGroups, selectedSubjectGroups);
  req.session.destroy();
  res.json({ success: true, id: uniqueId });
});

app.listen(3000, () => {
  console.log('Server running on port 3000');
});

async function getNewIcalFile(url) {
  const folderPath = getNewFolderPath();
  fs.mkdirSync(folderPath);
  const filePath = path.join(folderPath, 'calendar.ics');
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  const client = await page.target().createCDPSession()
  await client.send('Page.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: folderPath,
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

function getNewFolderPath() {
  let i = 1;
  while (fs.existsSync(path.join(__dirname, 'temp', `cal_${i}`)))
    i++;
  return path.join(__dirname, 'temp', `cal_${i}`);
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
  fs.rmSync(path.dirname(filePath), { recursive: true, force: true });
  return events;
}

function filterIcalEvents(events, filteredGlobalGroups, filteredSubjectGroups) {
  let filteredEvents = events.filter(event => {
    if (filteredGlobalGroups.has(event.group))
      return true;
    if (filteredSubjectGroups[event.subject] && filteredSubjectGroups[event.subject] == event.group)
      return true;
    return false;
  });
  return filteredEvents;
}

function generateNewIcalFile(events, filePath) {
  let icalString = '';
  icalString += "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPROID:WTT FILTERING\r\n"
  for (let event of events) {
    icalString += `BEGIN:VEVENT\r\nUID:${event.UID}\r\nLOCATION:${event.LOCATION}\r\nDTSTART:${event.DTSTART}\r\nDTSTAMP:${event.DTSTAMP}\r\nDTEND:${event.DTEND}\r\nSUMMARY:${event.SUMMARY}\r\nDESCRIPTION:${event.DESCRIPTION}\r\nEND:VEVENT\r\n`;
  }
  icalString += "END:VCALENDAR\r\n";
  fs.writeFileSync(filePath, icalString);
}

function appendFilters(uniqueId, wiseLink, selectedGlobalGroups, selectedSubjectGroups) {
  const filters = {
    id: uniqueId,
    date: new Date(),
    wiseLink: wiseLink,
    globalGroups: Array.from(selectedGlobalGroups),
    subjectGroups: selectedSubjectGroups
  };
  const mainFilePath = path.join(__dirname, 'filters', 'main.json');
  let mainFile;
  try {
    mainFile = JSON.parse(fs.readFileSync(mainFilePath));
  } catch (error) {
    mainFile = [];
  }
  mainFile.push(filters);
  fs.writeFileSync(mainFilePath, JSON.stringify(mainFile));
}

async function refreshIcals() {
  console.time('refreshIcals');
  const filtersFilePath = path.join(__dirname, 'filters', 'main.json');
  let filtersJSON;
  try {
    filtersJSON = JSON.parse(fs.readFileSync(filtersFilePath));
  } catch (error) {
    filtersJSON = [];
  }
  const batchSize = 10;
  for (let i = 0; i < filtersJSON.length; i += batchSize) {
    const batch = filtersJSON.slice(i, i + batchSize);
    const downloadPromises = batch.map(filter => getNewIcalFile(filter.wiseLink));
    const filepaths = await Promise.all(downloadPromises);

    for (let j = 0; j < batch.length; j++) {
      const filter = batch[j];
      const filePath = filepaths[j];
      const events = parseICalFile(filePath);
      const selectedGlobalGroups = new Set(filter.globalGroups);
      const selectedSubjectGroups = filter.subjectGroups;
      const filteredEvents = filterIcalEvents(events, selectedGlobalGroups, selectedSubjectGroups);
      const destinationFilePath = path.join(__dirname, 'filters', 'ical', `${filter.id}.ics`);
      generateNewIcalFile(filteredEvents, destinationFilePath);
    }
  }

  console.timeEnd('refreshIcals');
}