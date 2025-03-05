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
            workTimes: array of event instances that are times to work on the task, not separate event object (OPTIONAL)
                [
                    same contents as an event instance,
                    ...
                ]
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

function exists(obj) {
    return obj != null && obj != undefined;
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
        ASSERT(exists(element), `HTML.get element with id ${id} DNE`);
        
        // Check if multiple elements share the same ID
        let allWithId = document.querySelectorAll(`#${id}`);
        ASSERT(allWithId.length === 1, `HTML.get found ${allWithId.length} elements with id ${id}, should be exactly 1`);
        
        return element;
    }

    // get but it may not exist
    getUnsafely(id) {
        ASSERT(typeof(id) == "string", "HTML.getUnsafely id must be a string");
        
        // If there's an element at all, verify it's the only one
        let element = document.getElementById(id);
        if (element !== null) {
            let allWithId = document.querySelectorAll(`#${id}`);
            ASSERT(allWithId.length === 1, `HTML.getUnsafely found ${allWithId.length} elements with id ${id}, should be at most 1`);
        }
        
        return element;
    }

    setId(element, id) {
        ASSERT(exists(element) && typeof(id) == "string", "HTML.setId element must exist and id must be a string");

        // Check if id is already in use
        let existingElement = document.getElementById(id);
        ASSERT(existingElement === null, `HTML.setId id ${id} is already in use`);
        element.id = id;
    }

    body = document.body;
    head = document.head;

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
    setStyle(element, styles) {
        ASSERT(element != null && element != undefined && styles != undefined && styles != null);
        ASSERT(Object.keys(styles).length > 0);
        for (const key of Object.keys(styles)) {
            ASSERT(typeof(key) == "string", `Property "${key}" must be a string`);
            ASSERT(styles[key] != null && typeof(styles[key]) == "string", `Value for property "${key}" must be a non-null string`);
            element.style[key] = styles[key];
        }
    }

    hasStyle(element, property) {
        ASSERT(element != null && element != undefined && property != null && property != undefined && typeof(property) == "string");
        return element.style[property] != null && element.style[property] != undefined && element.style[property] != "";
    }

    getStyle(element, property) {
        ASSERT(element != null && element != undefined && property != null && property != undefined && typeof(property) == "string");
        ASSERT(this.hasStyle(element, property), `Element does not have property "${property}"`);
        return element.style[property];
    }
}();

// the only use of stylesheet because "body *" in JS is not efficient to select
// Create a style element
let styleElement = HTML.make('style');
    styleElement.textContent = `
  body * {
    margin: 0;
    padding: 0;
    display: inline-block;
    font-size: 200px; /* This is to make sure that default font sizes are never used */
    font-family: 'Inter';
    white-space: pre; /* This preserves whitespace leading */
  }
`;
HTML.head.appendChild(styleElement);

HTML.setStyle(HTML.body, {
    margin: '0',
    padding: '0',
    display: 'inline-block',
    fontSize: '200px', // this is to make sure that default font sizes are never used and will be noticeable
    fontFamily: 'Inter',
    whiteSpace: 'pre' // preserves leading whitespace
});


let logo = HTML.make('img');
logo.src = './scribblit_logo_2_black.svg';
HTML.setId(logo, 'logo');
HTML.setStyle(logo, {
    position: 'fixed',
    width: '100px',
    height: 'auto',
    top: String(windowBorderMargin) + 'px',
    left: String(windowBorderMargin) + 'px'
});
HTML.body.appendChild(logo);

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
    ASSERT(parseFloat(HTML.getStyle(element, 'width').slice(0, -2)).toFixed(2) == columnWidth.toFixed(2), `renderDay element width (${parseFloat(HTML.getStyle(element, 'width').slice(0, -2)).toFixed(2)}) is not ${columnWidth.toFixed(2)}`);
    ASSERT(!isNaN(columnWidth), "columnWidth must be a number");
    ASSERT(HTML.getStyle(element, 'height').slice(HTML.getStyle(element, 'height').length-2, HTML.getStyle(element, 'height').length) == 'px', `element height last 2 chars aren't 'px': ${HTML.getStyle(element, 'height').slice(HTML.getStyle(element, 'height').length-2, HTML.getStyle(element, 'height').length)}`);
    ASSERT(!isNaN(parseFloat(HTML.getStyle(element, 'height').slice(0, -2))), "element height is not a number");

    // look for hour markers
    if (HTML.getUnsafely(`day${index}hourMarker1`) == null) { // create hour markers
        // if one is missing, all 24 must be missing
        for (let j = 0; j < 24; j++) {
            ASSERT(/^\d+px$/.test(HTML.getStyle(element, 'top')), "element.style.top is not a string of int followed by 'px'");
            let dayElementVerticalPos = parseInt(HTML.getStyle(element, 'top').slice(0, -2));
            ASSERT(HTML.getStyle(element, 'left').slice(HTML.getStyle(element, 'left').length-2, HTML.getStyle(element, 'left').length) == 'px', `element style 'left' last 2 chars aren't 'px': ${HTML.getStyle(element, 'left').slice(HTML.getStyle(element, 'left').length-2, HTML.getStyle(element, 'left').length)}`);
            ASSERT(!isNaN(parseFloat(HTML.getStyle(element, 'left').slice(0, -2))), "element height is not a number");
            let dayElementHorizontalPos = parseInt(HTML.getStyle(element, 'left').slice(0, -2));

            ASSERT(HTML.getStyle(element, 'height').slice(HTML.getStyle(element, 'height').length-2, HTML.getStyle(element, 'height').length) == 'px', `element height last 2 chars aren't 'px': ${HTML.getStyle(element, 'height').slice(HTML.getStyle(element, 'height').length, HTML.getStyle(element, 'height').length-2)}`);
            ASSERT(!isNaN(parseFloat(HTML.getStyle(element, 'height').slice(0, -2))), "element height is not a number");
            let dayHeight = parseFloat(HTML.getStyle(element, 'height').slice(0, -2));

            if (j > 0) { // on the first hour, we only need the text
                ASSERT(HTML.getUnsafely(`day${index}hourMarker${j}`) == null, `hourMarker1 exists but hourMarker${j} doesn't`);
                let hourMarker = HTML.make('div');
                HTML.setId(hourMarker, `day${index}hourMarker${j}`);
                
                HTML.setStyle(hourMarker, {
                    'position': 'fixed',
                    'width': String(columnWidth + 1) + 'px',
                    'height': '1px',
                    'top': String(dayElementVerticalPos + (j * dayHeight / 24)) + 'px',
                    'left': String(dayElementHorizontalPos + 1) + 'px',
                    'backgroundColor': '#000'
                });
                
                HTML.body.appendChild(hourMarker);
            }

            // create hour marker text
            ASSERT(HTML.getUnsafely(`day${index}hourMarkerText${j}`) == null, `hourMarkerText1 exists but hourMarkerText${j} doesn't`);
            let hourMarkerText = HTML.make('div');
            HTML.setId(hourMarkerText, `day${index}hourMarkerText${j}`);
            
            HTML.setStyle(hourMarkerText, {
                'position': 'fixed',
                'top': String(dayElementVerticalPos + (j * dayHeight / 24) + 2) + 'px',
                'left': String(dayElementHorizontalPos + 4) + 'px',
                'color': '#000',
                'fontFamily': 'JetBrains Mono',
                'fontSize': '12px'
            });
            
            HTML.setData(hourMarkerText, 'leadingWhitespace', true);
            hourMarkerText.innerHTML = nthHourText(j);
            HTML.body.appendChild(hourMarkerText);
        }
    } else { // update hour markers
        for (let j = 0; j < 24; j++) {
            let dayElementVerticalPos = parseInt(HTML.getStyle(element, 'top').slice(0, -2));
            let dayElementHorizontalPos = parseInt(HTML.getStyle(element, 'left').slice(0, -2));
            let dayHeight = parseFloat(HTML.getStyle(element, 'height').slice(0, -2));
            if (j > 0) { // on the first hour, we only need the text
                // adjust position of hour markers
                let hourMarker = HTML.get(`day${index}hourMarker${j}`); // will raise an error if hourMarker1 exists but hourMarker${j} doesn't`);
                
                HTML.setStyle(hourMarker, {
                    'top': String(dayElementVerticalPos + (j * dayHeight / 24)) + 'px',
                    'left': String(dayElementHorizontalPos + 1) + 'px',
                    'width': String(columnWidth + 1) + 'px'
                });
            }

            // adjust position of hour marker text
            let hourMarkerText = HTML.get(`day${index}hourMarkerText${j}`); // will raise an error if hourMarkerText1 exists but hourMarkerText${j} doesn't`);
            
            HTML.setStyle(hourMarkerText, {
                'top': String(dayElementVerticalPos + (j * dayHeight / 24) + 2) + 'px',
                'left': String(dayElementHorizontalPos + 4) + 'px'
            });
        }

        // first hour (text only)
        let hourMarkerText = HTML.get(`day${index}hourMarkerText0`);
        let dayElementVerticalPos = parseInt(HTML.getStyle(element, 'top').slice(0, -2));
        let dayElementHorizontalPos = parseInt(HTML.getStyle(element, 'left').slice(0, -2));
        
        HTML.setStyle(hourMarkerText, {
            'top': String(dayElementVerticalPos + 2) + 'px',
            'left': String(dayElementHorizontalPos + 4) + 'px'
        });
    }
}

function renderCalendar(days) {
    ASSERT(exists(days) && Array.isArray(days) && exists(SETTINGS) && exists(SETTINGS.numberOfCalendarDays) && days.length == SETTINGS.numberOfCalendarDays)
    ASSERT(SETTINGS.stacking == true || SETTINGS.stacking == false, "SETTINGS.stacking must be a boolean");
    if (SETTINGS.stacking) { // vertically stack each 2 days and task list
        // TODO
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
            HTML.setStyle(dayElement, {
                position: 'fixed',
                width: String(columnWidth) + 'px',
                height: String(window.innerHeight - (2 * windowBorderMargin) - headerSpace) + 'px',
                top: String(windowBorderMargin + headerSpace) + 'px',
                left: String(windowBorderMargin + ((columnWidth + gapBetweenColumns) * (i+1))) + 'px',
                border: '1px solid #000',
                borderRadius: '5px'
            });
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