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
                        startTime: HH-MM
                        endTime: HH-MM
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
}

if (localStorage.getItem("numberOfCalendarColumns") == null) {
    SETTINGS.numberOfCalendarDays = 2;
} else {
    SETTINGS.numberOfCalendarDays = localStorage.getItem("numberOfCalendarColumns");
}

let gapBetweenColumns = 4
let windowBorderMargin = 6;
let columnWidth; // portion of screen

if (localStorage.getItem("SETTINGS.stacking") == null) {
    SETTINGS.stacking = false
} else {
    SETTINGS.stacking = true;
}

let currentDays = [];
for (i = 0; i < SETTINGS.numberOfCalendarDays; i++) {
    currentDays.push(getDay(i));
}

let HTML = new class HTMLroot {
    logo = document.getElementById('logo');
}();

HTML.logo.style.top = String(windowBorderMargin) + 'px';
HTML.logo.style.left = String(windowBorderMargin) + 'px';

// how many columns of calendar days plus the task list
function numberOfColumns() {
    if (SETTINGS.stacking) {
        return Math.floor(SETTINGS.numberOfCalendarDays / 2) + 1;
    } else {
        return SETTINGS.numberOfCalendarDays + 1;
    }
}

function renderDay(day, element) {
    // get existing element
    ASSERT(day != undefined && day != null, "renderDay day is undefined or null");
    ASSERT(/^\d{4}-\d{2}-\d{2}$/.test(day), "day doesn't fit YYYY-MM-DD format");
    ASSERT(element != undefined && element != null, "renderDay element is undefined or null");
    ASSERT(element.style.width == String(columnWidth) + 'px', `renderDay element width (${element.style.width}) is not ${columnWidth}`);
    ASSERT(!isNaN(columnWidth), "columnWidth must be a float");
    ASSERT(element.style.height != undefined && element.style.height != null, "element height is undefined or null");
    // FIX THIS REGEX TO PARSE FLOAT INSTEAD OF INT
    ASSERT(/^\d+px$/.test(element.style.height), "element height is not a string of int followed by 'px'");
    ASSERT(!isNaN(element.style.height.slice(0, -2)), "element height is not a float");

    // look for hour markers
    if (element.getElementById(`day${i}hourMarker1`) == null) { // create 24 hour markers
        // if one is missing, all 24 must be missing
        for (i = 0; i < 24; i++) {
            ASSERT(element.getElementById(`day${i}hourMarker${i}`) == null, `hourMarker${i} exists but hourMarker${i} doesn't`);
            let hourMarker = document.createElement('div');
            hourMarker.id = `day${i}hourMarker${i}`;
            hourMarker.style.position = 'fixed';
            hourMarker.style.width = String(columnWidth) + 'px';
            hourMarker.style.height = '1px';
            hourMarker.backgroundColor = '#000';
            ASSERT(element.style.top != undefined && element.style.top != null, "element.style.top is undefined or null");
            // assert that element.style.top is string of int followed by 'px'
            ASSERT(/^\d+px$/.test(element.style.top), "element.style.top is not a string of int followed by 'px'");
            let dayElementVerticalPos = parseInt(element.style.top.slice(0, -2));
            // same asserts for height
            ASSERT(element.style.height != undefined && element.style.height != null, "element.style.height is undefined or null");
            ASSERT(/^\d+px$/.test(element.style.height), "element.style.height is not a string of int followed by 'px'");
            let dayHeight = parseFloat(element.style.height.slice(0, -2));
            hourMarker.style.top = String(dayElementVerticalPos + (i * dayHeight / 24)) + 'px';
        }
    }

}

function renderCalendar(days) {
    ASSERT(days != undefined && days != null && days.length == SETTINGS.numberOfCalendarDays)

    if (SETTINGS.stacking) { // vertically stack each 2 days and task list

    } else { // no vertical stacking
        for (i = 0; i < 7; i++) {
            if (i >= SETTINGS.numberOfCalendarDays) {
                // remove excess day elements
                let dayElement = document.getElementById('day' + String(i));
                if (dayElement != null) {
                    dayElement.remove();
                }
                continue;
            }

            let dayElement = document.getElementById('day' + String(i));
            if (dayElement == null) {
                // create new element
                dayElement = document.createElement('div');
                dayElement.id = 'day' + String(i);
                dayElement.style.position = 'fixed';
                dayElement.style.width = String(columnWidth) + 'px';
                dayElement.style.top = String(windowBorderMargin) + 'px';
                dayElement.style.left = String(windowBorderMargin + ((columnWidth + gapBetweenColumns) * i)) + 'px';
            }
            renderDay(days[i], dayElement);
        }
    }
}

function resizeListener() {
    columnWidth = ((window.innerWidth - windowBorderMargin - 6) / (numberOfColumns() + 1));
    ASSERT(!isNaN(columnWidth), "columnWidth must be a float");
    renderCalendar(currentDays);
}

window.onresize = resizeListener;

// init call
resizeListener();