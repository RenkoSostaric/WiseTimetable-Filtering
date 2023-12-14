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
    const descriptions = getDescriptions(filePath);
    const globalGroups = getGlobalGroups(descriptions);
    const subjectGroups = getSubjectGroups(descriptions);
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

function getGlobalGroups(descriptions) {
    let globalGroups = new Set(Array.from(descriptions).map(description => description.substring(description.lastIndexOf(',') + 2)).sort());
    console.log(globalGroups);
    return globalGroups;
}

function getSubjectGroups(descriptions) {
    let subjectGroupPairs = Array.from(descriptions).map(description => [description.substring(0, description.indexOf(',')), description.substring(description.lastIndexOf(',') + 2)]);
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

function getDescriptions(filePath) {
    const icalText = fs.readFileSync(filePath, 'utf-8');
    let descriptions = new Set(Array.from(icalText.matchAll(/DESCRIPTION:(.+)/g)).map(m => m[1]).sort());
    return descriptions;    
}
