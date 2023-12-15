const fs = require('fs');

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

console.time('Parse');
let events = parseICalFile("temp\\calendar.ics");
console.timeEnd('Parse');