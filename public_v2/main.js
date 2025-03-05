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

let TESTING = true;

if (TESTING) {
    localStorage.clear();
}

const DateTime = luxon.DateTime; // .local() sets the timezone to the user's timezone

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
        return DateTime.local().toISODate();
    } else {
        return DateTime.local().plus({days: offset}).toISODate();
    }
}
let taskEventArray = [];

let palettes = {
    'dark': { // default
        accent: ['#47b6ff', '#b547ff'],
        shades: ['#111111', '#383838', '#636363', '#9e9e9e', '#ffffff']
    },
    'midnight': {
        accent: ['#47b6ff', '#b547ff'],
        shades: ['#000000', '#6e6e6e', '#d1d1d1', '#9e9e9e', '#ffffff']
    }
    // TODO: add more palettes
};

let user; // user data / all the stuff they can change
if (!exists(localStorage.getItem("userData"))) {
    user = {
        taskEventArray: taskEventArray,
        SETTINGS: {
                stacking: false,
                numberOfCalendarDays: 2,
                ampmOr24: 'ampm'
            },
        palette: palettes['dark'],
        firstDayInCalendar: getDay(0) // set to today
    };
    localStorage.setItem("userData", JSON.stringify(user));
} else {
    user = JSON.parse(localStorage.getItem("userData"));
    ASSERT(exists(user.taskEventArray) && exists(user.SETTINGS));
    ASSERT(user.SETTINGS.stacking == true || user.SETTINGS.stacking == false, "userData.SETTINGS.stacking must be a boolean");
    ASSERT(Number.isInteger(user.SETTINGS.numberOfCalendarDays), "userData.SETTINGS.numberOfCalendarDays must be an integer");
    ASSERT(1 <= user.SETTINGS.numberOfCalendarDays && user.SETTINGS.numberOfCalendarDays <= 7, "userData.SETTINGS.numberOfCalendarDays out of range 1-7");
    ASSERT(user.SETTINGS.ampmOr24 == 'ampm' || user.SETTINGS.ampmOr24 == '24');
    ASSERT(Array.isArray(user.taskEventArray));
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

function currentDays() {
    let days = [];
    
    // Start with the first day stored in user data
    // Use SETTINGS.firstDayInCalendar instead of firstDayInCalendar
    let firstDay = DateTime.fromISO(user.SETTINGS.firstDayInCalendar);
    
    // Check if parsing was successful
    if (!firstDay.isValid) {
        ASSERT(false, "Invalid date:", user.SETTINGS.firstDayInCalendar);
        // Fallback to today's date if the stored date is invalid
        firstDay = DateTime.local();
    }
    
    for (let i = 0; i < user.SETTINGS.numberOfCalendarDays; i++) {
        // Add the current day and each subsequent day
        days.push(firstDay.plus({days: i}).toISODate());
    }
    
    return days;
}

// returns today, yesterday, tomorrow, or the day of the week
function dayOfWeekOrRelativeDay(day) {
    let date = DateTime.fromISO(day);
    let today = DateTime.local();
    if (date.hasSame(today, 'day')) {
        return 'Today';
    } else if (date.hasSame(today.minus({days: 1}), 'day')) {
        return 'Yesterday';
    } else if (date.hasSame(today.plus({days: 1}), 'day')) {
        return 'Tomorrow';
    } else {
        return date.toFormat('EEEE');
    }
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
        for (let key of Object.keys(styles)) {
            ASSERT(typeof(key) == "string", `Property "${key}" must be a string`);
            ASSERT(exists(styles[key]), `Value for property "${key}" must be a non-null string`);

            // camelcase to hyphenated css property
            let cssKey = key.replace(/([a-z0-9]|(?=[A-Z]))([A-Z])/g, '$1-$2').toLowerCase();

            element.style[cssKey] = styles[key];
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
        color: #ff00aa; /* make sure that default colors are never used */
    }
`;
HTML.head.appendChild(styleElement);

HTML.setStyle(HTML.body, {
    backgroundColor: user.palette.shades[0],
});

let logo = HTML.make('img');
logo.src = './scribblit_logo_2.svg';
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
    if (user.SETTINGS.stacking) {
        return Math.floor(user.SETTINGS.numberOfCalendarDays / 2) + 1;
    } else {
        return user.SETTINGS.numberOfCalendarDays + 1;
    }
}

function nthHourText(n) {
    ASSERT(Number.isInteger(n), "nthHourText n must be an integer");
    ASSERT(0 <= n && n < 24, "nthHourText n out of range 0-23");
    ASSERT(user.SETTINGS.ampmOr24 === 'ampm' || user.SETTINGS.ampmOr24 === '24', "user.SETTINGS.ampmOr24 must be 'ampm' or '24'");
    if (user.SETTINGS.ampmOr24 == '24') {
        if (n < 10) {
            return " " + String(n) + ":00";
        } else {
            return String(n) + ":00";
        }
    } else { // ampm
        if (n == 0) {
            return '12AM';
        } else if (n == 12) {
            return '12PM';
        } else if (n < 10) {
            return " " + String(n) + 'AM';
        } else if (n < 12) {
            return String(n) + 'AM';
        } else if (n < 22) {
            return " " + String(n-12) + 'PM';
        } else {
            return String(n-12) + 'PM';
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
                    position: 'fixed',
                    width: String(columnWidth + 1) + 'px',
                    height: '1px',
                    top: String(dayElementVerticalPos + (j * dayHeight / 24)) + 'px',
                    left: String(dayElementHorizontalPos + 1) + 'px',
                    backgroundColor: user.palette.shades[3],
                    zIndex: 400
                });
                
                HTML.body.appendChild(hourMarker);
            }

            // create hour marker text
            ASSERT(HTML.getUnsafely(`day${index}hourMarkerText${j}`) == null, `hourMarkerText1 exists but hourMarkerText${j} doesn't`);
            let hourMarkerText = HTML.make('div');
            HTML.setId(hourMarkerText, `day${index}hourMarkerText${j}`);
            
            let fontSize;
            if (user.SETTINGS.ampmOr24 == 'ampm') {
                fontSize = '12px';
            } else {
                fontSize = '11px'; // account for additional colon character
            }
            HTML.setStyle(hourMarkerText, {
                position: 'fixed',
                top: String(dayElementVerticalPos + (j * dayHeight / 24) + 2) + 'px',
                left: String(dayElementHorizontalPos + 4) + 'px',
                color: user.palette.shades[3],
                fontFamily: 'JetBrains Mono',
                fontSize: fontSize,
                zIndex: 400
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
                    top: String(dayElementVerticalPos + (j * dayHeight / 24)) + 'px',
                    left: String(dayElementHorizontalPos + 1) + 'px',
                    width: String(columnWidth + 1) + 'px'
                });
            }

            // adjust position of hour marker text
            let hourMarkerText = HTML.get(`day${index}hourMarkerText${j}`); // will raise an error if hourMarkerText1 exists but hourMarkerText${j} doesn't`);
            
            HTML.setStyle(hourMarkerText, {
                top: String(dayElementVerticalPos + (j * dayHeight / 24) + 2) + 'px',
                left: String(dayElementHorizontalPos + 4) + 'px'
            });
        }

        // first hour (text only)
        let hourMarkerText = HTML.get(`day${index}hourMarkerText0`);
        let dayElementVerticalPos = parseInt(HTML.getStyle(element, 'top').slice(0, -2));
        let dayElementHorizontalPos = parseInt(HTML.getStyle(element, 'left').slice(0, -2));
        
        HTML.setStyle(hourMarkerText, {
            top: String(dayElementVerticalPos + 2) + 'px',
            left: String(dayElementHorizontalPos + 4) + 'px'
        });
    }

    // get all event instances and task work time instances

}

let topOfCalendarDay = 20; // px

function renderCalendar(days) {
    ASSERT(exists(days) && Array.isArray(days) && exists(user.SETTINGS) && exists(user.SETTINGS.numberOfCalendarDays) && days.length == user.SETTINGS.numberOfCalendarDays, "renderCalendar days must be an array of length user.SETTINGS.numberOfCalendarDays");
    ASSERT(user.SETTINGS.stacking == true || user.SETTINGS.stacking == false, "user.SETTINGS.stacking must be a boolean");
    if (user.SETTINGS.stacking) { // vertically stack each 2 days and task list
        // TODO
    } else { // no vertical stacking
        for (let i = 0; i < 7; i++) {
            if (i >= user.SETTINGS.numberOfCalendarDays) {
                // remove excess day elements
                let dayElement = HTML.getUnsafely('day' + String(i));
                if (dayElement != null) {
                    dayElement.remove();
                }
                // remove excess hour markers
                for (let j = 0; j < 24; j++) {
                    let hourMarker = HTML.getUnsafely(`day${i}hourMarker${j}`);
                    if (exists(hourMarker)) {
                        hourMarker.remove();
                    }
                    let hourMarkerText = HTML.getUnsafely(`day${i}hourMarkerText${j}`);
                    if (exists(hourMarkerText)) {
                        hourMarkerText.remove();
                    }
                }

                // remove excess background elements
                let backgroundElement = HTML.getUnsafely('day' + String(i) + 'Background');
                if (exists(backgroundElement)) {
                    backgroundElement.remove();
                }

                // remove excess date text elements
                let dateText = HTML.getUnsafely('day' + String(i) + 'DateText');
                if (exists(dateText)) {
                    dateText.remove();
                }
                continue;
            }

            let dayElement = HTML.getUnsafely('day' + String(i));
            if (!exists(dayElement)) {
                dayElement = HTML.make('div'); // create new element
                HTML.setId(dayElement, 'day' + String(i));
            }
            HTML.setStyle(dayElement, {
                position: 'fixed',
                width: String(columnWidth) + 'px',
                height: String(window.innerHeight - (2 * windowBorderMargin) - headerSpace - topOfCalendarDay) + 'px',
                top: String(windowBorderMargin + headerSpace + topOfCalendarDay) + 'px',
                left: String(windowBorderMargin + ((columnWidth + gapBetweenColumns) * (i+1))) + 'px',
                border: '1px solid ' + user.palette.shades[3],
                borderRadius: '5px',
                backgroundColor: user.palette.shades[0],
                zIndex: 300 // below hour markers
            });
            HTML.body.appendChild(dayElement);

            // add background element which is the same but with lower z index
            let backgroundElement = HTML.getUnsafely('day' + String(i) + 'Background');
            if (!exists(backgroundElement)) {
                backgroundElement = HTML.make('div');
                HTML.setId(backgroundElement, 'day' + String(i) + 'Background');
            }
            HTML.setStyle(backgroundElement, {
                position: 'fixed',
                width: String(columnWidth) + 'px',
                height: String(window.innerHeight - (2 * windowBorderMargin) - headerSpace) + 'px',
                top: String(windowBorderMargin + headerSpace) + 'px',
                left: String(windowBorderMargin + ((columnWidth + gapBetweenColumns) * (i+1))) + 'px',
                backgroundColor: user.palette.shades[1],
                border: '1px solid ' + user.palette.shades[3],
                borderRadius: '5px',
                zIndex: 200, // below dayElement
            });
            HTML.body.appendChild(backgroundElement);

            // add YYYY-MM-DD text to top right of background element
            let dateText = HTML.getUnsafely('day' + String(i) + 'DateText');
            if (!exists(dateText)) {
                dateText = HTML.make('div');
                HTML.setId(dateText, 'day' + String(i) + 'DateText');
            }
            HTML.setStyle(dateText, {
                position: 'fixed',
                top: String(windowBorderMargin + headerSpace + 3.5) + 'px',
                left: String(windowBorderMargin + ((columnWidth + gapBetweenColumns) * (i+1)) + columnWidth - 74) + 'px',
                fontSize: '12px',
                color: user.palette.shades[3],
                fontFamily: 'Inter',
                fontWeight: 'bold',
                zIndex: 400
            });
            dateText.innerHTML = days[i].replaceAll("-", '/');   
            HTML.body.appendChild(dateText);


            // add dayOfWeekOrRelativeDay text to top left of background element
            let dayOfWeekText = HTML.getUnsafely('day' + String(i) + 'DayOfWeekText');
            if (!exists(dayOfWeekText)) {
                dayOfWeekText = HTML.make('div');
                HTML.setId(dayOfWeekText, 'day' + String(i) + 'DayOfWeekText');
            }
            HTML.setStyle(dayOfWeekText, {
                position: 'fixed',
                top: String(windowBorderMargin + headerSpace + 3.5) + 'px',
                left: String(windowBorderMargin + ((columnWidth + gapBetweenColumns) * (i+1)) + 4) + 'px',
                fontSize: '12px',
                color: user.palette.shades[3],
                fontFamily: 'Inter',
                fontWeight: 'bold',
                zIndex: 400
            });
            dayOfWeekText.innerHTML = dayOfWeekOrRelativeDay(days[i]);
            if (dayOfWeekOrRelativeDay(days[i]) == 'Today') {
                // white text for today
                HTML.setStyle(dateText, { color: user.palette.shades[4] });
                HTML.setStyle(dayOfWeekText, { color: user.palette.shades[4] });
            }
            HTML.body.appendChild(dayOfWeekText);

            renderDay(days[i], dayElement, i);
        }
    }
}

function resizeListener() {
    columnWidth = ((window.innerWidth - (2*windowBorderMargin) - gapBetweenColumns*(numberOfColumns() - 1)) / numberOfColumns()); // 1 fewer gaps than columns
    ASSERT(!isNaN(columnWidth), "columnWidth must be a float");
    renderCalendar(currentDays());
}

function toggleNumberOfCalendarDays() {
    ASSERT(exists(user.SETTINGS.numberOfCalendarDays) && Number.isInteger(user.SETTINGS.numberOfCalendarDays));
    ASSERT(1 <= user.SETTINGS.numberOfCalendarDays && user.SETTINGS.numberOfCalendarDays <= 7);
    
    // looping from 2 to 8 incrementing by 1
    if (user.SETTINGS.numberOfCalendarDays >= 7) {
        user.SETTINGS.numberOfCalendarDays = 1;
    } else {
        user.SETTINGS.numberOfCalendarDays++;
    }
    localStorage.setItem("userData", JSON.stringify(user));

    let buttonNumberCalendarDays = HTML.get('buttonNumberCalendarDays');
    buttonNumberCalendarDays.innerHTML = 'Toggle Number of Calendar Days: ' + user.SETTINGS.numberOfCalendarDays;
    resizeListener();
}

let buttonNumberCalendarDays = HTML.make('div');
HTML.setId(buttonNumberCalendarDays, 'buttonNumberCalendarDays');
HTML.setStyle(buttonNumberCalendarDays, {
    position: 'fixed',
    top: windowBorderMargin + 'px',
    // logo width + window border margin*2
    left: String(100 + windowBorderMargin*2) + 'px',
    backgroundColor: user.palette.shades[1],
    fontSize: '12px',
    color: user.palette.shades[3],
});
ASSERT(exists(user.SETTINGS.numberOfCalendarDays) && Number.isInteger(user.SETTINGS.numberOfCalendarDays));
ASSERT(1 <= user.SETTINGS.numberOfCalendarDays && user.SETTINGS.numberOfCalendarDays <= 7);
buttonNumberCalendarDays.innerHTML = 'Toggle Number of Calendar Days: ' + user.SETTINGS.numberOfCalendarDays;
buttonNumberCalendarDays.onclick = toggleNumberOfCalendarDays;
HTML.body.appendChild(buttonNumberCalendarDays);

function toggleAmPmOr24() {
    ASSERT(exists(user.SETTINGS));
    ASSERT(user.SETTINGS.ampmOr24 == 'ampm' || user.SETTINGS.ampmOr24 == '24');
    if (user.SETTINGS.ampmOr24 == 'ampm') {
        user.SETTINGS.ampmOr24 = '24';
    } else {
        user.SETTINGS.ampmOr24 = 'ampm';
    }
    localStorage.setItem("userData", JSON.stringify(user));

    let buttonAmPmOr24 = HTML.get('buttonAmPmOr24');
    buttonAmPmOr24.innerHTML = 'Toggle 12 Hour or 24 Hour Time';
    
    // update all hour markers
    for (let i = 0; i < user.SETTINGS.numberOfCalendarDays; i++) {
        for (let j = 0; j < 24; j++) {
            let hourMarkerText = HTML.get(`day${i}hourMarkerText${j}`);
            hourMarkerText.innerHTML = nthHourText(j);
            let fontSize;
            if (user.SETTINGS.ampmOr24 == 'ampm') {
                fontSize = '12px';
            } else {
                fontSize = '10px'; // account for additional colon character
            }
            HTML.setStyle(hourMarkerText, { fontSize: fontSize });
        }
    }
}

let buttonAmPmOr24 = HTML.make('div');
HTML.setId(buttonAmPmOr24, 'buttonAmPmOr24');
HTML.setStyle(buttonAmPmOr24, {
    position: 'fixed',
    top: windowBorderMargin + 'px',
    // logo width + window border margin*2
    left: String(100 + windowBorderMargin*2 + 250) + 'px',
    backgroundColor: user.palette.shades[1],
    fontSize: '12px',
    color: user.palette.shades[3],
});
buttonAmPmOr24.onclick = toggleAmPmOr24;
buttonAmPmOr24.innerHTML = 'Toggle 12 Hour or 24 Hour Time';
HTML.body.appendChild(buttonAmPmOr24);

window.onresize = resizeListener;

// init call
user.SETTINGS.firstDayInCalendar = getDay(0); // on page load we want to start with today
resizeListener();