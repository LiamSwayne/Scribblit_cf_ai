/*
each item in the taskEventArray looks like this:
{
    kind: 'task' or 'event'
    id: 'randomized ID'
    name: string
    description: string (OPTIONAL)
    task:
        {
            instances: array of dates/patterns of when the task is due
                [
                    {
                        recurring: T/F
                        date: YYYY-MM-DD (for when recurring is false)
                        datePattern: (for when recurring is true)
                            {
                                kind: string of which ONE of the below has been selected, ex: 'everyNthDay'
                                everyNDays: repeat every n days, ex: every 2 mondays would be date of first monday and 14
                                    {
                                        initialDay: DD
                                        initialMonth: MM
                                        initialYear: YYYY (OPTIONAL in case of leap year and want to reset on start day each year)
                                        n: int
                                    }
                                annually: on this same day every year (using every 365 wouldn't work because of leap years)
                                    {
                                        day: DD
                                        month: MM
                                    }
                                monthly: int on the n'th day of each month
                            }
                        range: inclusive range of when the date pattern covers (for when recurring is true)
                            {
                                kind: 'dateRange' or 'recurrenceCount'
                                dateRange:
                                    {
                                        start: YYYY-MM-DD
                                        end: YYYY-MM-DD (OPTIONAL)
                                    }
                                recurrenceCount: int
                            }
                        time: HH:MM (24 hour time) (OPTIONAL)
                    },
                    ...
                ]
            completions: unix times at which it was completed
                [
                    {
                        date: YYYY-MM-DD either was an instance or is part of a recur pattern of an instance, same applies to time but only if generated from an instance with a due time
                        time: HH:MM (24 hour time) (OPTIONAL)
                        completed: int of unix time upon completion
                    }
                    ...
                ]
            hideUntil: when to hide the task until (applies to all instances) (on by default) (OPTIONAL)
                {
                    kind: string of 'dayOf' meaning hide until day of, 'relative' meaning hide until int number of days before, or 'date' meaning a specific date
                    relative: int
                    date: YYYY-MM-DD
                }
            showOverdue: T/F to show overdue instances of a task. for most tasks you want this on, but for something like brushing teeth, if you forget to check it off for a day, you don't want to see overdue times you should've done it yesterday plus today's times (on by default)
        }
    event:
        {
            instances: mostly the same as task but some events can last multiple days
                [
                    {
                        recurring: T/F
                        startDate: SAME AS TASK date
                        startDatePattern: SAME AS TASK but this is only for starting dates
                        startTime: HH-MM (OPTIONAL)
                        endTime: HH-MM (OPTIONAL)
                        differentEndDate: YYYY-MM-DD for events that end on a different day than they start (for when recurring is F) (OPTIONAL)
                        differentEndDatePattern: int number of days after start date (cannot be 0) (for when recurring is T) (OPTIONAL)
                    }
                ]
        }
}
*/

/* we keep all the data so when they select something else in the taskEvent editor we set it to their last stored value */

const DateTime = luxon.DateTime.local(); // local sets the timezone to the user's timezone

function ASSERT(condition, message="") {
    if (typeof(condition) != "boolean") {
        console.error('MALFORMED ASSERTION');
    }
    if (!condition) {
        if (message == "") {
            console.error('ASSERTION FAILED');
        } else {
            console.error('ASSERTION FAILED: ' + message);
        }
        console.trace();
    }
}

// async/await sleep function like Python's
function sleep(seconds) {
    return new Promise(resolve => setTimeout(resolve, seconds * 1000)); // setTimeout works in milliseconds
}

function getDay(offset) {
    ASSERT(0 <= offset && offset < 7, "getDay offset out of range 0-6");
    if (offset == 0) {
        return DateTime.toISODate();
    } else {
        return DateTime.plus({days: offset}).toISODate();
    }
}

let SETTINGS = {
    stacking: undefined,
    numberOfCalendarDays: undefined,
    ampmOr24: undefined
}

if (localStorage.getItem("numberOfCalendarColumns") == null) {
    SETTINGS.numberOfCalendarDays = 2;
} else {
    SETTINGS.numberOfCalendarDays = localStorage.getItem("numberOfCalendarColumns");
}

if (localStorage.getItem("ampmOr24") == null) {
    SETTINGS.ampmOr24 = 'ampm';
} else {
    SETTINGS.ampmOr24 = localStorage.getItem("ampmOr24");
}

let gapBetweenColumns = 6;
let windowBorderMargin = 6;
let columnWidth; // portion of screen
let headerSpace = 26; // px gap at top to make space for logo and buttons

let adjustCalendarUp; // px to adjust calendar up by based on browser
if (navigator.userAgent.toLowerCase().indexOf('firefox') > -1) {
    adjustCalendarUp = 0;
} else {
    adjustCalendarUp = 2;
}

if (localStorage.getItem("SETTINGS.stacking") == null) {
    SETTINGS.stacking = false
} else {
    SETTINGS.stacking = true;
}

let currentDays = [];
for (let i = 0; i < SETTINGS.numberOfCalendarDays; i++) {
    currentDays.push(getDay(i));
}

let HTML = new class HTMLroot {    
    get(id) {
        ASSERT(typeof(id) == "string", "HTML.get id must be a string");
        let element = document.getElementById(id);
        ASSERT(element != null, `HTML.get element with id ${id} is null`);
        return element;
    }

    // get but it may not exist
    getUnsafely(id) {
        ASSERT(typeof(id) == "string", "HTML.getUnsafely id must be a string");
        return document.getElementById(id);
    }

    body = document.body;

    make(tag) {
        ASSERT(typeof(tag) == "string", "HTML.make tag must be a string");
        return document.createElement(tag);
    }

    setData(element, key, value) {
        ASSERT(element != null, "HTML.setData element is null");
        ASSERT(typeof(key) == "string", "HTML.setData key must be a string");
        let data = element.dataset.data;
        if (data == undefined || data == null) {
            data = {};
        } else {
            data = JSON.parse(data);
        }

        // add or update key
        data[key] = value;
        element.dataset.data = JSON.stringify(data);
    }

    getData(element, key) {
        ASSERT(element != null, "HTML.getData element is null");
        ASSERT(typeof(key) == "string", "HTML.getData key must be a string");
        let data = element.dataset.data;
        
        ASSERT(data != undefined && data != null, "HTML.getData data is undefined or null");

        data = JSON.parse(data);
        return data[key];
    }

    getDataUnsafely(element, key) {
        ASSERT(element != null, "HTML.getDataUnsafely element is null");
        ASSERT(typeof(key) == "string", "HTML.getDataUnsafely key must be a string");
        let data = element.dataset.data;
        if (data == undefined || data == null) {
            return null;
        } else {
            data = JSON.parse(data);
            return data[key];
        }
    }

    // function to cleanly apply styles to an element
    style(element, css1, css2=null) {
        ASSERT(element != null, "HTML.style element is null");

        // either (css1 is a dictionary of style propety:value and css2 is null) or (css1 is a single style property and css2 is its value)
        if (css2 == null) {
            ASSERT(typeof(css1) == "object", "HTML.style css1 must be an object");
            // verify that it's a 1D dictionary of strings:strings
            ASSERT(Object.keys(css1).length > 0);
            for (let key in Object.keys(css1)) {
                ASSERT(key != null && typeof(key) == "string");
                ASSERT(css1[key] != null && typeof(css1[key]) == "string");
                element.style[key] = css1[key];
            }
        } else {
            ASSERT(css1 != null && css2 != null);
            ASSERT(typeof(css1) == "string" && typeof(css2) == "string");
            ASSERT(css1 != "" && css2 != "");
            element.style[css1] = css2;
        }
    }

}();

let logo = HTML.get('logo');
logo.style.top = String(windowBorderMargin) + 'px';
logo.style.left = String(windowBorderMargin) + 'px';

// how many columns of calendar days plus the task list
function numberOfColumns() {
    if (SETTINGS.stacking) {
        return Math.floor(SETTINGS.numberOfCalendarDays / 2) + 1;
    } else {
        return SETTINGS.numberOfCalendarDays + 1;
    }
}

function nthHourText(n) {
    ASSERT(Number.isInteger(n), "nthHourText n must be an integer");
    ASSERT(0 <= n && n < 24, "nthHourText n out of range 0-23");
    ASSERT(SETTINGS.ampmOr24 === 'ampm' || SETTINGS.ampmOr24 === '24', "SETTINGS.ampmOr24 must be 'ampm' or '24'");
    if (SETTINGS.ampmOr24 == '24') {
        if (n < 10) {
            return " " + String(n) + ":00";
        } else {
            return String(n) + ":00";
        }
    } else { // ampm
        if (n == 0) {
            return '12 AM';
        } else if (n == 12) {
            return '12 PM';
        } else if (n < 10) {
            return " " + String(n) + ' AM';
        } else if (n < 12) {
            return String(n) + ' AM';
        } else if (n < 22) {
            return " " + String(n-12) + ' PM';
        } else {
            return String(n-12) + ' PM';
        }
    }
}

function renderDay(day, element, index) {
    // get existing element
    ASSERT(day != undefined && day != null, "renderDay day is undefined or null");
    ASSERT(/^\d{4}-\d{2}-\d{2}$/.test(day), "day doesn't fit YYYY-MM-DD format");
    ASSERT(element != undefined && element != null, "renderDay element is undefined or null");
    ASSERT(parseFloat(element.style.width.slice(0, -2)).toFixed(2) == columnWidth.toFixed(2), `renderDay element width (${parseFloat(element.style.width.slice(0, -2)).toFixed(2)}) is not ${columnWidth.toFixed(2)}`);
    ASSERT(!isNaN(columnWidth), "columnWidth must be a number");
    ASSERT(element.style.height != undefined && element.style.height != null, "element height is undefined or null");
    ASSERT(element.style.height.slice(element.style.height.length-2, element.style.height.length) == 'px', `element height last 2 chars aren't 'px': ${element.style.height.slice(element.style.height.length-2, element.style.height.length)}`);
    ASSERT(!isNaN(parseFloat(element.style.height.slice(0, -2))), "element height is not a number");

    // look for hour markers
    if (HTML.getUnsafely(`day${index}hourMarker1`) == null) { // create hour markers
        // if one is missing, all 24 must be missing
        for (let j = 1; j < 24; j++) { // skip first because there's a top line
            ASSERT(HTML.getUnsafely(`day${index}hourMarker${j}`) == null, `hourMarker1 exists but hourMarker${j} doesn't`);
            let hourMarker = HTML.make('div');
            hourMarker.id = `day${index}hourMarker${j}`;
            hourMarker.style.position = 'fixed';
            hourMarker.style.width = String(columnWidth + 1) + 'px';
            hourMarker.style.height = '1px';
            hourMarker.backgroundColor = '#000';
            ASSERT(element.style.top != undefined && element.style.top != null, "element.style.top is undefined or null");
            ASSERT(/^\d+px$/.test(element.style.top), "element.style.top is not a string of int followed by 'px'");
            let dayElementVerticalPos = parseInt(element.style.top.slice(0, -2));
            ASSERT(element.style.left.slice(element.style.left.length-2, element.style.left.length) == 'px', `element style 'left' last 2 chars aren't 'px': ${element.style.left.slice(element.style.left.length-2, element.style.left.length)}`);
            ASSERT(!isNaN(parseFloat(element.style.left.slice(0, -2))), "element height is not a number");
            let dayElementHorizontalPos = parseInt(element.style.left.slice(0, -2));
            ASSERT(element.style.height != undefined && element.style.height != null, "element.style.height is undefined or null");
            ASSERT(element.style.height.slice(element.style.height.length-2, element.style.height.length) == 'px', `element height last 2 chars aren't 'px': ${element.style.height.slice(element.style.height.length, element.style.height.length-2)}`);
            ASSERT(!isNaN(parseFloat(element.style.height.slice(0, -2))), "element height is not a number");
            let dayHeight = parseFloat(element.style.height.slice(0, -2));
            hourMarker.style.top = String(dayElementVerticalPos + (j * dayHeight / 24)) + 'px';
            hourMarker.style.left = String(dayElementHorizontalPos + 1) + 'px';
            hourMarker.style.backgroundColor = '#000';
            HTML.body.appendChild(hourMarker);

            // create hour marker text
            ASSERT(HTML.getUnsafely(`day${index}hourMarkerText${j}`) == null, `hourMarkerText1 exists but hourMarkerText${j} doesn't`);
            let hourMarkerText = HTML.make('div');
            hourMarkerText.id = `day${index}hourMarkerText${j}`;
            hourMarkerText.style.position = 'fixed';

            hourMarkerText.style.top = String(dayElementVerticalPos + (j * dayHeight / 24) + 2) + 'px';
            hourMarkerText.style.left = String(dayElementHorizontalPos + 4) + 'px';
            hourMarkerText.style.color = '#000';
            hourMarkerText.style.fontFamily = 'JetBrains Mono';
            hourMarkerText.style.fontSize = '12px';
            HTML.setData(hourMarkerText, 'leadingWhitespace', true);
            hourMarkerText.innerHTML = nthHourText(j);
            HTML.body.appendChild(hourMarkerText);
        }

        // first hour (text only)
        let hourMarkerText = HTML.make('div');
        hourMarkerText.id = `day${index}hourMarkerText0`;
        hourMarkerText.style.position = 'fixed';
        let dayElementVerticalPos = parseInt(element.style.top.slice(0, -2));
        hourMarkerText.style.top = String(dayElementVerticalPos + 2) + 'px';
        let dayElementHorizontalPos = parseInt(element.style.left.slice(0, -2));
        hourMarkerText.style.left = String(dayElementHorizontalPos + 4) + 'px';
        hourMarkerText.style.color = '#000';
        hourMarkerText.style.fontFamily = 'JetBrains Mono';
        hourMarkerText.style.fontSize = '12px';
        HTML.setData(hourMarkerText, 'leadingWhitespace', true);
        hourMarkerText.innerHTML = nthHourText(0);
        HTML.body.appendChild(hourMarkerText);
    } else { // update hour markers
        for (let j = 1; j < 24; j++) {
            // adjust position of hour markers
            let hourMarker = HTML.get(`day${index}hourMarker${j}`);
            ASSERT(hourMarker != null, `hourMarker1 exists but hourMarker${j} doesn't`);
            let dayElementVerticalPos = parseInt(element.style.top.slice(0, -2));
            let dayElementHorizontalPos = parseInt(element.style.left.slice(0, -2));
            let dayHeight = parseFloat(element.style.height.slice(0, -2));
            hourMarker.style.top = String(dayElementVerticalPos + (j * dayHeight / 24)) + 'px';
            hourMarker.style.left = String(dayElementHorizontalPos + 1) + 'px';

            // update width of hour markers
            hourMarker.style.width = String(columnWidth + 1) + 'px';

            // adjust position of hour marker text
            let hourMarkerText = HTML.get(`day${index}hourMarkerText${j}`);
            ASSERT(hourMarkerText != null, `hourMarkerText1 exists but hourMarkerText${j} doesn't`);
            hourMarkerText.style.top = String(dayElementVerticalPos + (j * dayHeight / 24) + 2) + 'px';
            hourMarkerText.style.left = String(dayElementHorizontalPos + 4) + 'px';
        }

        // first hour (text only)
        let hourMarkerText = HTML.get(`day${index}hourMarkerText0`);
        let dayElementVerticalPos = parseInt(element.style.top.slice(0, -2));
        hourMarkerText.style.top = String(dayElementVerticalPos + 2) + 'px';
        let dayElementHorizontalPos = parseInt(element.style.left.slice(0, -2));
        hourMarkerText.style.left = String(dayElementHorizontalPos + 4) + 'px';
    }
}

function renderCalendar(days) {
    ASSERT(days != undefined && days != null && days.length == SETTINGS.numberOfCalendarDays)
    ASSERT(SETTINGS.stacking == true || SETTINGS.stacking == false, "SETTINGS.stacking must be a boolean");
    if (SETTINGS.stacking) { // vertically stack each 2 days and task list
    } else { // no vertical stacking
        for (let i = 0; i < 7; i++) {
            if (i >= SETTINGS.numberOfCalendarDays) {
                // remove excess day elements
                let dayElement = HTML.getUnsafely('day' + String(i));
                if (dayElement != null) {
                    dayElement.remove();
                }
                continue;
            }

            let dayElement = HTML.getUnsafely('day' + String(i));
            if (dayElement == null) {
                dayElement = HTML.make('div'); // create new element
            }
            dayElement.id = 'day' + String(i);
            dayElement.style.position = 'fixed';
            dayElement.style.width = String(columnWidth) + 'px';
            dayElement.style.height = String(window.innerHeight - (2 * windowBorderMargin) - headerSpace) + 'px';
            dayElement.style.top = String(windowBorderMargin + headerSpace) + 'px';
            dayElement.style.left = String(windowBorderMargin + ((columnWidth + gapBetweenColumns) * (i+1))) + 'px'; // i+1 because first column is task list
            dayElement.style.border = '1px solid #000';
            dayElement.style.borderRadius = '5px';
            HTML.body.appendChild(dayElement);

            renderDay(days[i], dayElement, i);
        }
    }
}

function resizeListener() {
    columnWidth = ((window.innerWidth - (2*windowBorderMargin) - gapBetweenColumns*(numberOfColumns() - 1)) / numberOfColumns()); // 1 fewer gaps than columns
    ASSERT(!isNaN(columnWidth), "columnWidth must be a float");
    renderCalendar(currentDays);
}

window.onresize = resizeListener;

// init call
resizeListener();