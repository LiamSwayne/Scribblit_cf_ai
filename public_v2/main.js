const DateTime = luxon.DateTime; // .local() sets the timezone to the user's timezone

// the first day shown in calendar
let firstDayInCalendar;

// Save user data to localStorage
function saveUserData(user) {
    ASSERT(type(user, User));
    const userJson = user.toJson();
    localStorage.setItem("userData", JSON.stringify(userJson));
}

// Load user data from localStorage, returns a User object
function loadUserData() {
    const userData = localStorage.getItem("userData");
    if (!exists(userData)) {
        // Create default user if no data exists
        return User.createDefault();
    } else {
        try {
            const userJson = JSON.parse(userData);
            return User.fromJson(userJson);
        } catch (error) {
            log("Error parsing user data, creating default user: " + error.message);
            return User.createDefault();
        }
    }
}

// returns today's ISO date or the date offset from today by the given number of days
function getDayNDaysFromToday(offset) {
    ASSERT(type(offset, Int) && offset >= 0 && offset < 7);
    let dt = DateTime.local();
    if (offset > 0) {
        dt = dt.plus({days: offset});
    }
    
    // Create a DateField object instead of string
    return new DateField(dt.year, dt.month, dt.day);
}
let entityArray = [];

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

// load sample data
if (TESTING) {
    localStorage.clear();
    // Create sample tasks and events
    let entityArray = [
        // one-time task with work time
        new Entity(
            'task-001', // id
            'Submit Final Project', // name
            'Complete and submit the final project for CS401', // description
            new TaskData( // data
                [
                    new NonRecurringTaskInstance(
                        new DateField(2025, 3, 10), // date
                        new TimeField(23, 59), // dueTime
                        [] // completion
                    )
                ], // instances
                NULL, // hideUntil
                true, // showOverdue
                [
                    new NonRecurringEventInstance(
                        new DateField(2025, 3, 7), // startDate
                        new TimeField(14, 30), // startTime
                        new TimeField(16, 30), // endTime
                        NULL // differentEndDate
                    )
                ] // workSessions
            ) // data
        ),
    
        // recurring weekly task with completion
        new Entity(
            'task-002', // id
            'Weekly Report', // name
            'Submit weekly status report to manager', // description
            new TaskData( // data
                [
                    new RecurringTaskInstance(
                        new EveryNDaysPattern(
                            new DateField(2025, 3, 7), // initialDate
                            7 // n
                        ), // datePattern
                        new TimeField(17, 0), // dueTime
                        new DateRange(
                            new DateField(2025, 3, 7), // startDate
                            new DateField(2025, 5, 30) // endDate
                        ), // range
                        [1709913600000] // completion
                    )
                ], // instances
                NULL, // hideUntil
                true, // showOverdue
                [
                    new RecurringEventInstance(
                        new EveryNDaysPattern(
                            new DateField(2025, 3, 7), // initialDate
                            7 // n
                        ), // startDatePattern
                        new TimeField(14, 0), // startTime
                        new TimeField(15, 0), // endTime
                        new DateRange(
                            new DateField(2025, 3, 7), // startDate
                            new DateField(2025, 5, 30) // endDate
                        ), // range
                        NULL // differentEndDatePattern
                    )
                ] // workSessions
            ) // data
        ),
    
        // monthly recurring task
        new Entity(
            'task-003', // id
            'Monthly Budget Review', // name
            'Review and update monthly budget', // description
            new TaskData( // data
                [
                    new RecurringTaskInstance(
                        new MonthlyPattern(1, [true, true, true, true, true, true, true, true, true, true, true, true]), // datePattern
                        new TimeField(10, 0), // dueTime
                        new RecurrenceCount(6), // range
                        [] // completion
                    )
                ], // instances
                NULL, // hideUntil
                true, // showOverdue
                [] // workSessions
            ) // data
        ),
    
        // one-time all-day event
        new Entity(
            'event-001', // id
            'Company Holiday', // name
            '', // description
            new EventData( // data
                [
                    new NonRecurringEventInstance(
                        new DateField(2025, 3, 8), // startDate
                        NULL, // startTime
                        NULL, // endTime
                        NULL // differentEndDate
                    )
                ] // instances
            ) // data
        ),
    
        // recurring daily meeting
        new Entity(
            'event-002', // id
            'Team Standup', // name
            'Daily team standup meeting', // description
            new EventData( // data
                [
                    new RecurringEventInstance(
                        new EveryNDaysPattern(
                            new DateField(2025, 3, 6), // initialDate
                            1 // n
                        ), // startDatePattern
                        new TimeField(9, 30), // startTime
                        new TimeField(10, 0), // endTime
                        new DateRange(
                            new DateField(2025, 3, 6), // startDate
                            new DateField(2025, 3, 20) // endDate
                        ), // range
                        NULL // differentEndDatePattern
                    )
                ] // instances
            ) // data
        ),
    
        // one-time multi-day event
        new Entity(
            'event-003', // id
            'Annual Conference', // name
            'Industry annual conference', // description
            new EventData( // data
                [
                    new NonRecurringEventInstance(
                        new DateField(2025, 3, 15), // startDate
                        new TimeField(9, 0), // startTime
                        new TimeField(17, 0), // endTime
                        new DateField(2025, 3, 17) // differentEndDate
                    )
                ] // instances
            ) // data
        ),
    
        // recurring weekend workshop with multi-day span
        new Entity(
            'event-004', // id
            'Weekend Workshop', // name
            'Weekend coding workshop', // description
            new EventData( // data
                [
                    new RecurringEventInstance(
                        new EveryNDaysPattern(
                            new DateField(2025, 3, 8), // initialDate
                            7 // n
                        ), // startDatePattern
                        new TimeField(10, 0), // startTime
                        new TimeField(16, 0), // endTime
                        new RecurrenceCount(4), // range
                        1 // differentEndDatePattern
                    )
                ] // instances
            ) // data
        ),

        // Non-recurring timed reminder
        new Entity(
            'reminder-001',
            'Call Alex re: Project X',
            'Follow up on Project X deliverables',
            new ReminderData([
                new NonRecurringReminderInstance(
                    new DateField(2025, 3, 9),
                    new TimeField(14, 30)
                )
            ])
        ),

        // Recurring daily reminder (all-day) for 3 occurrences
        new Entity(
            'reminder-002',
            'Water Plants',
            'Daily reminder for indoor plants',
            new ReminderData([
                new RecurringReminderInstance(
                    new EveryNDaysPattern(new DateField(2025, 3, 8), 1), // Daily starting 2025-03-08
                    NULL, // All-day
                    new RecurrenceCount(3) // For 3 days
                )
            ])
        ),

        // Non-recurring all-day reminder
        new Entity(
            'reminder-003',
            "Sarah's Birthday",
            "Don't forget to send wishes!",
            new ReminderData([
                new NonRecurringReminderInstance(
                    new DateField(2025, 3, 12),
                    NULL // All-day
                )
            ])
        )
    ];      

    // Create user object with the sample data
    let user = new User(
        entityArray,
        {
            stacking: false,
            numberOfCalendarDays: 2,
            ampmOr24: 'ampm',
            startOfDayOffset: 0,
            endOfDayOffset: 0,
        },
        {
            accent: ['#47b6ff', '#b547ff'],
            shades: ['#111111', '#383838', '#636363', '#9e9e9e', '#ffffff']
        }
    );
    
    // Store using saveUserData function
    saveUserData(user);
}

let user = loadUserData();
// Set firstDayInCalendar to today on page load
firstDayInCalendar = getDayNDaysFromToday(0);
ASSERT(type(user, User));

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

// the current days to display
function currentDays() {
    // firstDayInCalendar must be DateField
    ASSERT(type(firstDayInCalendar, DateField));
    // numberOfCalendarDays must be Int between 1 and 7
    ASSERT(type(user.settings.numberOfCalendarDays, Int) && user.settings.numberOfCalendarDays >= 1 && user.settings.numberOfCalendarDays <= 7);
    let days = [];
    for (let i = 0; i < user.settings.numberOfCalendarDays; i++) {
        // Convert DateField to DateTime, add days, then create a new DateField
        let dt = DateTime.local(firstDayInCalendar.year, firstDayInCalendar.month, firstDayInCalendar.day);
        let dtWithOffset = dt.plus({days: i});
        let dateField = new DateField(dtWithOffset.year, dtWithOffset.month, dtWithOffset.day);
        days.push(dateField);
    }
    // ensure days array contains DateField objects
    ASSERT(type(days, List(DateField)));
    return days;
}

// returns today, yesterday, tomorrow, or the day of the week
// 'day' must be an ISO date string in 'YYYY-MM-DD' format
function dayOfWeekOrRelativeDay(day) {
    ASSERT(type(day, DateField));
    // Convert to DateTime for comparison
    let date = DateTime.local(day.year, day.month, day.day);
    ASSERT(date.isValid);
    
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
        ASSERT(type(id, String));
        let element = document.getElementById(id);
        ASSERT(exists(element), `HTML.get element with id ${id} DNE`);
        
        // Check if multiple elements share the same ID
        ASSERT(document.querySelectorAll(`#${id}`).length === 1, `HTML.get found ${document.querySelectorAll(`#${id}`).length} elements with id ${id}, should be exactly 1`);
        
        return element;
    }

    // get but it may not exist
    getUnsafely(id) {
        ASSERT(type(id, String));
        
        // If there's an element at all, verify it's the only one
        let element = document.getElementById(id);
        if (exists(element)) {
            ASSERT(document.querySelectorAll(`#${id}`).length === 1, `HTML.getUnsafely found ${document.querySelectorAll(`#${id}`).length} elements with id ${id}, should be at most 1`);
        }
        
        return element;
    }

    setId(element, id) {
        ASSERT(exists(element) && type(id, String));

        // Check if id is already in use
        // this is part of our interface with the DOM, so regular null is allowed in code
        ASSERT(document.getElementById(id) === null, `HTML.setId id ${id} is already in use`);
        element.id = id;
    }

    body = document.body;
    head = document.head;

    make(tag) {
        ASSERT(type(tag, String));
        return document.createElement(tag);
    }

    setData(element, key, value) {
        ASSERT(exists(element) && type(key, String));
        
        let data;
        if (!exists(element.dataset.data)) {
            data = {};
        } else {
            data = JSON.parse(element.dataset.data);
        }

        // add or update key
        data[key] = value;
        element.dataset.data = JSON.stringify(data);
    }

    getData(element, key) {
        ASSERT(exists(element) && type(key, String));
        ASSERT(exists(element.dataset.data), "HTML.getData data is undefined or null");

        return JSON.parse(element.dataset.data)[key];
    }

    getDataUnsafely(element, key) {
        ASSERT(exists(element) && type(key, String));
        
        if (!exists(element.dataset.data)) {
            return NULL;
        }
        
        return JSON.parse(element.dataset.data)[key];
    }

    // function to cleanly apply styles to an element
    setStyle(element, styles) {
        ASSERT(exists(element) && type(styles, Dict(String, String)));
        ASSERT(Object.keys(styles).length > 0);
        
        for (let key of Object.keys(styles)) {
            // camelcase to hyphenated css property
            element.style[key.replace(/([a-z0-9]|(?=[A-Z]))([A-Z])/g, '$1-$2').toLowerCase()] = styles[key];
        }
    }

    setHoverStyle(element, styles) {
        ASSERT(exists(element) && type(styles, Dict(String, String)));
        ASSERT(Object.keys(styles).length > 0);
        
        // Check if element has an ID
        ASSERT(type(element.id, NonEmptyString), "Element must have an ID to use setHoverStyle");

        // remove existing style element
        let existingStyleElement = document.getElementById(`style-${element.id}`);
        if (exists(existingStyleElement)) {
            existingStyleElement.remove();
        }
        
        // Build CSS string
        let cssRules = `#${element.id}:hover {`;
        for (let key of Object.keys(styles)) {
            cssRules += `${key.replace(/([a-z0-9]|(?=[A-Z]))([A-Z])/g, '$1-$2').toLowerCase()}: ${styles[key]}; `;
        }
        cssRules += `}`;
        
        // Add a transition property to enable animations if desired
        cssRules += `#${element.id} { transition: all 0.3s ease; }`;
        
        // Create and append style element
        const styleElement = this.make('style');
        this.setId(styleElement, `style-${element.id}`);
        styleElement.textContent = cssRules;
        this.head.appendChild(styleElement);
    }

    hasStyle(element, property) {
        ASSERT(exists(element) && type(property, String));
        return exists(element.style[property]) && element.style[property] !== "";
    }

    getStyle(element, property) {
        ASSERT(exists(element) && type(property, String));
        ASSERT(this.hasStyle(element, property), `Element does not have property "${property}"`);
        return element.style[property];
    }
}();

// the only use of stylesheet because "body *" in JS is not efficient to select
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
    ASSERT(type(user.settings.stacking, Boolean) && type(user.settings.numberOfCalendarDays, Int));
    if (user.settings.stacking) {
        return Math.floor(user.settings.numberOfCalendarDays / 2) + 1;
    }
    return user.settings.numberOfCalendarDays + 1;
}

function nthHourText(n) {
    ASSERT(type(n, Int));
    ASSERT(0 <= n && n < 24, "nthHourText n out of range 0-23");
    ASSERT(type(user, User));
    ASSERT(user.settings.ampmOr24 === 'ampm' || user.settings.ampmOr24 === '24');
    if (user.settings.ampmOr24 == '24') {
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

function generateInstancesFromPattern(instance, startUnix = NULL, endUnix = NULL) {
    ASSERT(type(instance, Union(RecurringTaskInstance, RecurringEventInstance, RecurringReminderInstance)));
    ASSERT(type(startUnix, Union(Int, NULL)));
    ASSERT(type(endUnix, Union(Int, NULL)));
    
    let pattern;
    if (type(instance, RecurringTaskInstance)) {
        pattern = instance.datePattern;
    } else if (type(instance, RecurringEventInstance)) {
        ASSERT(type(instance.startDatePattern, Union(EveryNDaysPattern, MonthlyPattern, AnnuallyPattern)));
        pattern = instance.startDatePattern;
    } else if (type(instance, RecurringReminderInstance)) { // RecurringReminderInstance
        ASSERT(type(instance.datePattern, Union(EveryNDaysPattern, MonthlyPattern, AnnuallyPattern)));
        pattern = instance.datePattern;
    } else {
        ASSERT(false, "Unknown instance type in generateInstancesFromPattern");
    }

    // Determine start date
    let startDateTime;
    if (type(startUnix, Int)) {
        startDateTime = DateTime.fromMillis(startUnix);
    } else if (type(instance.range, DateRange)) {
        ASSERT(type(instance.range.startDate, DateField));
        startDateTime = DateTime.local(instance.range.startDate.year, instance.range.startDate.month, instance.range.startDate.day);
    } else if (type(pattern, EveryNDaysPattern)) {
        startDateTime = DateTime.local(pattern.initialDate.year, pattern.initialDate.month, pattern.initialDate.day);
    } else {
        startDateTime = DateTime.local();
    }
    // Determine end date
    let endDateTime;
    if (type(endUnix, Int)) {
        endDateTime = DateTime.fromMillis(endUnix);
    } else if (type(instance.range, DateRange)) {
        if (instance.range.endDate !== NULL) {
            ASSERT(type(instance.range.endDate, DateField));
            endDateTime = DateTime.local(instance.range.endDate.year, instance.range.endDate.month, instance.range.endDate.day);
        } else {
            endDateTime = NULL;
        }
    } else if (type(instance.range, RecurrenceCount)) {
        endDateTime = NULL;
    } else {
        ASSERT(false);
    }
    const dates = [];
    let currentDateTime = startDateTime;
    let count = 0;
    // max of 10000 instances if it's a recurring pattern that doesn't have a count
    const maxCount = type(instance.range, RecurrenceCount) ? instance.range.count : 10000;
    while ((endDateTime === NULL || currentDateTime <= endDateTime) && count < maxCount) {
        // build timestamp (start of day + optional time)
        let timestamp = currentDateTime.startOf('day').toMillis();
        let hour;
        let minute;
        if (type(instance, RecurringTaskInstance) && type(instance.dueTime, TimeField)) {
            hour = instance.dueTime.hour;
            minute = instance.dueTime.minute;
        } else if (type(instance, RecurringEventInstance) && type(instance.startTime, TimeField)) {
            hour = instance.startTime.hour;
            minute = instance.startTime.minute;
        } else if (type(instance, RecurringReminderInstance) && type(instance.time, TimeField)) {
            hour = instance.time.hour;
            minute = instance.time.minute;
        }
        ASSERT(type(hour, Int));
        ASSERT(type(minute, Int));
        ASSERT(0 <= hour && hour < 24);
        ASSERT(0 <= minute && minute < 60);
        timestamp = currentDateTime.set({hour: hour, minute: minute}).toMillis();
        dates.push(timestamp);
        count++;
        // step to next
        if (type(pattern, EveryNDaysPattern)) {
            currentDateTime = currentDateTime.plus({days: pattern.n});
        } else if (type(pattern, MonthlyPattern)) {
            let nextDateTime = currentDateTime.plus({months: 1}).set({day: pattern.day});
            // Find the next valid month
            // array of booleans, true if the pattern is active in that month
            while (!pattern.months[nextDateTime.month - 1]) {
                nextDateTime = nextDateTime.plus({months: 1}).set({day: pattern.day});
                if (nextDateTime.year > currentDateTime.year + 5) { // Arbitrary limit to prevent runaway loops
                    log("Warning: Potential infinite loop in MonthlyPattern processing. No valid month found within 5 years.");
                    currentDateTime = endDateTime.plus({days: 1}); // Force exit
                    break;
                }
            }
            currentDateTime = nextDateTime;
        } else if (type(pattern, AnnuallyPattern)) {
            currentDateTime = currentDateTime.plus({years: 1}).set({month: pattern.month, day: pattern.day});
        } else {
            ASSERT(false);
        }
    }

    ASSERT(dates.length <= maxCount);

    if (dates.length === 10000) {
        // this is allowed, but we want to know about it
        log("hit 10000 instance limit for: " + instance.name);
    }

    return dates;
}

// check if all of a task is complete
function isTaskComplete(task) {
    ASSERT(type(task, TaskData));
    if (task.instances.length === 0) {
        return false;
    }

    for (let inst of task.instances) {
        if (type(inst, NonRecurringTaskInstance)) {
            ASSERT(type(inst.date, DateField));
            ASSERT(type(inst.completion, List(Int)));
            let dt = DateTime.local(inst.date.year, inst.date.month, inst.date.day);
            ASSERT(dt.isValid);
            let targetTs = dt.startOf('day').toMillis();
            if (type(inst.dueTime, TimeField)) {
                targetTs = dt.set({hour: inst.dueTime.hour, minute: inst.dueTime.minute}).toMillis();
            }
            if (!inst.completion.some(ct => {
                let cd = DateTime.fromMillis(ct);
                return cd.hasSame(DateTime.fromMillis(targetTs).startOf('day'), 'day');
            })) {
                return false;
            }
        } else if (type(inst, RecurringTaskInstance)) {
            ASSERT(type(inst.range, Union(DateRange, RecurrenceCount)));
            let patternDates;
            if (type(inst.range, DateRange)) {
                ASSERT(type(inst.range.startDate, DateField));
                ASSERT(type(inst.range.endDate, DateField));
                let startMs = DateTime.local(inst.range.startDate.year, inst.range.startDate.month, inst.range.startDate.day).startOf('day').toMillis();
                let endMs = DateTime.local(inst.range.endDate.year, inst.range.endDate.month, inst.range.endDate.day).endOf('day').toMillis();
                patternDates = generateInstancesFromPattern(inst, startMs, endMs);
            } else {
                ASSERT(type(inst.range, RecurrenceCount));
                ASSERT(type(inst.range.count, Int));
                ASSERT(inst.range.count > 0);
                patternDates = generateInstancesFromPattern(inst);
                ASSERT(patternDates.length === inst.range.count);
            }
            ASSERT(type(inst.completion, List(Int)));
            for (let pd of patternDates) {
                if (!inst.completion.some(ct => DateTime.fromMillis(ct).hasSame(DateTime.fromMillis(pd).startOf('day'), 'day'))) {
                    return false;
                }
            }
        } else {
            ASSERT(false);
        }
    }

    return true;
}

function renderDay(day, element, index) {
    ASSERT(type(day, DateField));
    // get existing element
    
    ASSERT(element != undefined && element != null, "renderDay element is undefined or null");
    ASSERT(parseFloat(HTML.getStyle(element, 'width').slice(0, -2)).toFixed(2) == columnWidth.toFixed(2), `renderDay element width (${parseFloat(HTML.getStyle(element, 'width').slice(0, -2)).toFixed(2)}) is not ${columnWidth.toFixed(2)}`);
    ASSERT(!isNaN(columnWidth), "columnWidth must be a number");
    ASSERT(HTML.getStyle(element, 'height').slice(HTML.getStyle(element, 'height').length-2, HTML.getStyle(element, 'height').length) == 'px', `element height last 2 chars aren't 'px': ${HTML.getStyle(element, 'height').slice(HTML.getStyle(element, 'height').length-2, HTML.getStyle(element, 'height').length)}`);
    ASSERT(!isNaN(parseFloat(HTML.getStyle(element, 'height').slice(0, -2))), "element height is not a number");

    // look for hour markers
    if (HTML.getUnsafely(`day${index}hourMarker1`) == null) { // create hour markers
        // if one is missing, all 24 must be missing
        for (let j = 0; j < 24; j++) {
            ASSERT(!isNaN(parseFloat(HTML.getStyle(element, 'top').slice(0, -2)), "element top is not a number"));
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
                    zIndex: '400'
                });
                
                HTML.body.appendChild(hourMarker);
            }

            // create hour marker text
            ASSERT(HTML.getUnsafely(`day${index}hourMarkerText${j}`) == null, `hourMarkerText1 exists but hourMarkerText${j} doesn't`);
            let hourMarkerText = HTML.make('div');
            HTML.setId(hourMarkerText, `day${index}hourMarkerText${j}`);
            
            let fontSize;
            if (user.settings.ampmOr24 == 'ampm') {
                fontSize = '12px';
            } else {
                fontSize = '10px'; // account for additional colon character
            }
            HTML.setStyle(hourMarkerText, {
                position: 'fixed',
                top: String(dayElementVerticalPos + (j * dayHeight / 24) + 2) + 'px',
                left: String(dayElementHorizontalPos + 4) + 'px',
                color: user.palette.shades[3],
                fontFamily: 'JetBrains Mono',
                fontSize: fontSize,
                zIndex: '400'
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
    // task due dates don't go on the calendar but work times do
    // filter by not on this day and expand recurring into what's on this day
    /*
        filtered instance {
            start: int unix time,
            end: int unix time,
            wrapToPreviousDay: true/false, // optional, is this a multi-day event that wraps to the previous 
            day
            wrapToNextDay: true/false, // optional, is this a multi-day event that wraps to the next day
            completeTask: true/false, // is this work time on a task that's been completed
        }
        filtered all day instance {
            startDate: 'YYYY-MM-DD',
            faded: true/false
        }
    */
    // get unix start and end of day with user's offsets
    // Create DateTime from DateField
    let dayTime = DateTime.local(day.year, day.month, day.day);
    let startOfDay = dayTime.startOf('day').plus({hours: user.settings.startOfDayOffset});
    startOfDay = startOfDay.toMillis(); // unix
    let endOfDay = dayTime.endOf('day').plus({hours: user.settings.endOfDayOffset});
    endOfDay = endOfDay.toMillis() + 1; // +1 to include the end of the day

    let filteredInstances = [];
    let filteredAllDayInstances = [];
    for (let obj of user.entityArray) {
        ASSERT(type(obj, Entity));
        if (type(obj.data, TaskData)) {
            // Handle task work times
            if (exists(obj.data.workSessions)) {
                for (let workTime of obj.data.workSessions) {
                    ASSERT(type(workTime, Union(NonRecurringEventInstance, RecurringEventInstance)));
                    if (!exists(workTime.startTime)) {
                        // handle all-day session by type
                        if (type(workTime, NonRecurringEventInstance)) {
                            ASSERT(type(workTime.startDate, DateField));
                            let workDate = DateTime.local(workTime.startDate.year, workTime.startDate.month, workTime.startDate.day);
                            if (workDate.hasSame(dayTime, 'day')) {
                                filteredAllDayInstances.push({startDate: day, faded: false});
                            }
                        } else {
                            // Recurring all-day work session
                            // Calculate day boundaries for pattern matching
                            let dayStartMs = dayTime.startOf('day').toMillis();
                            let dayEndMs = dayTime.endOf('day').toMillis();
                            
                            // Generate all instances for this day using the helper
                            let patternDates = generateInstancesFromPattern(workTime, dayStartMs, dayEndMs);
                            
                            if (patternDates.length > 0) {
                                filteredAllDayInstances.push({startDate: day, faded: false});
                            }
                        }
                        continue;
                    }
                    
                    // Handle timed work sessions
                    if (type(workTime, NonRecurringEventInstance)) {
                        // Non-recurring work session - simple case
                        ASSERT(type(workTime.startDate, DateField));
                        let workStart = DateTime.local(workTime.startDate.year, workTime.startDate.month, workTime.startDate.day);
                        
                        workStart = workStart.plus({
                            hours: workTime.startTime.hour,
                            minutes: workTime.startTime.minute
                        });
                        
                        let workEnd;
                        if (exists(workTime.differentEndDate)) {
                            ASSERT(type(workTime.differentEndDate, DateField));
                            // Different end date
                            workEnd = DateTime.local(workTime.differentEndDate.year, workTime.differentEndDate.month, workTime.differentEndDate.day);
                        } else {
                            // Same end date as start
                            workEnd = DateTime.local(workTime.startDate.year, workTime.startDate.month, workTime.startDate.day);
                        }
                        
                        workEnd = workEnd.plus({
                            hours: workTime.endTime.hour,
                            minutes: workTime.endTime.minute
                        });
                        
                        // Convert to milliseconds for comparison
                        let workStartMs = workStart.toMillis();
                        let workEndMs = workEnd.toMillis();
                        
                        // Check if this work session falls on the current day
                        if ((workStartMs >= startOfDay && workStartMs <= endOfDay) ||
                            (workEndMs >= startOfDay && workEndMs <= endOfDay) ||
                            (workStartMs <= startOfDay && workEndMs >= endOfDay)) {
                            
                            filteredInstances.push({
                                startDate: workStartMs,
                                differentEndDate: workEndMs,
                                wrapToPreviousDay: workStartMs < startOfDay,
                                wrapToNextDay: workEndMs > endOfDay,
                                completeTask: isTaskComplete(obj.data)
                            });
                        }
                    } else {
                        // Recurring work session - use pattern helper
                        // Include a wider time range to catch wrap-around events
                        let dayBeforeMs = dayTime.minus({days: 1}).startOf('day').toMillis();
                        let dayAfterMs = dayTime.plus({days: 1}).endOf('day').toMillis();
                        
                        // Generate all instances from the pattern
                        let patternStartTimes = generateInstancesFromPattern(workTime, dayBeforeMs, dayAfterMs);
                        
                        // Process each instance
                        for (let startMs of patternStartTimes) {
                            let startTime = DateTime.fromMillis(startMs);
                            
                            // Calculate end time based on startTime and endTime fields
                            let endTime;
                            
                            if (workTime.differentEndDatePattern === NULL) {
                                // ends on same day
                                endTime = startTime.plus({hours: workTime.endTime.hour, minutes: workTime.endTime.minute});
                            } else {
                                // ends on different day
                                endTime = startTime.plus({days: workTime.differentEndDatePattern, hours: workTime.endTime.hour, minutes: workTime.endTime.minute});
                            }
                            
                            // Add the end time hours and minutes
                            endTime = endTime.plus({
                                hours: workTime.endTime.hour,
                                minutes: workTime.endTime.minute
                            });
                            
                            let endMs = endTime.toMillis();
                            
                            // Check if this instance overlaps with the current day
                            if ((startMs >= startOfDay && startMs <= endOfDay) ||
                                (endMs >= startOfDay && endMs <= endOfDay) ||
                                (startMs <= startOfDay && endMs >= endOfDay)) {
                                
                                filteredInstances.push({
                                    startDate: startMs,
                                    differentEndDate: endMs,
                                    wrapToPreviousDay: startMs < startOfDay,
                                    wrapToNextDay: endMs > endOfDay,
                                    completeTask: isTaskComplete(obj.data)
                                });
                            }
                        }
                    }
                }
            }
        } else if (type(obj.data, EventData)) {
            // Handle events similar to task work times but with some differences
            for (let instance of obj.data.instances) {
                ASSERT(type(instance, Union(NonRecurringEventInstance, RecurringEventInstance)));
                if (!exists(instance.startTime)) {
                    // handle all-day event by type
                    if (type(instance, NonRecurringEventInstance)) {
                        ASSERT(type(instance.startDate, DateField));
                        let eventDate = DateTime.local(instance.startDate.year, instance.startDate.month, instance.startDate.day);
                        if (eventDate.hasSame(dayTime, 'day')) {
                            filteredAllDayInstances.push({startDate: day, faded: false});
                        }
                    } else {
                        // Recurring all-day event
                        // Generate all instances of this pattern that fall on this day
                        let eventDayStart = dayTime.startOf('day').toMillis();
                        let eventDayEnd = dayTime.endOf('day').toMillis();
                        
                        // Use our helper function to get all instances on this day
                        let patternInstances = generateInstancesFromPattern(instance, eventDayStart, eventDayEnd);
                        
                        if (patternInstances.length > 0) {
                            // If any instance falls on this day, add it
                            filteredAllDayInstances.push({
                                startDate: day,
                                faded: false
                            });
                        }
                    }
                } else if (type(instance, NonRecurringEventInstance)) {
                    ASSERT(type(instance.startDate, DateField));
                    // Event with specific time
                    let eventStart = DateTime.local(instance.startDate.year, instance.startDate.month, instance.startDate.day);
                    
                    eventStart = eventStart.plus({
                        hours: instance.startTime.hour, 
                        minutes: instance.startTime.minute
                    }).toMillis();

                    let eventEnd;
                    
                    // Handle event end time
                    if (instance.endTime === NULL) {
                        // Default to 100 minutes if no end time specified. differentEndDate must be NULL here.
                        eventEnd = DateTime.fromMillis(eventStart).plus({minutes: 100}).toMillis();
                    } else {
                        ASSERT(type(instance.endTime, TimeField));
                        if (instance.differentEndDate !== NULL) {
                            // Multi-day event
                            eventEnd = DateTime.local(instance.differentEndDate.year, instance.differentEndDate.month, instance.differentEndDate.day);
                        } else {
                            // Same day event
                            eventEnd = DateTime.local(instance.startDate.year, instance.startDate.month, instance.startDate.day);
                        }
                        
                        eventEnd = eventEnd.plus({
                            hours: instance.endTime.hour, 
                            minutes: instance.endTime.minute
                        }).toMillis();
                    }
                    
                    // Check if event overlaps with this day
                    if ((eventStart >= startOfDay && eventStart <= endOfDay) || 
                        (eventEnd >= startOfDay && eventEnd <= endOfDay) ||
                        (eventStart <= startOfDay && eventEnd >= endOfDay)) {
                        
                        filteredInstances.push({
                            startDate: eventStart,
                            differentEndDate: eventEnd,
                            wrapToPreviousDay: eventStart < startOfDay,
                            wrapToNextDay: eventEnd > endOfDay,
                            completeTask: false // Events don't have complete state
                        });
                    }
                } else {
                    // Recurring event
                    // Generate all instances that overlap with this day
                    let dayBefore = dayTime.minus({days: 1}).startOf('day').toMillis();
                    let dayAfter = dayTime.plus({days: 1}).endOf('day').toMillis();
                    
                    // We look at a wider range to catch events that wrap from previous/to next day
                    let patternInstances = generateInstancesFromPattern(instance, dayBefore, dayAfter);
                    
                    for (let patternStart of patternInstances) {
                        // Calculate event end based on start
                        let patternEnd;
                        
                        if (exists(instance.endTime)) {
                            // Calculate hours/minutes difference between start and end times
                            let startHours = instance.startTime.hour;
                            let startMinutes = instance.startTime.minute;
                            let endHours = instance.endTime.hour;
                            let endMinutes = instance.endTime.minute;
                            
                            // Calculate duration
                            let durationHours = endHours - startHours;
                            let durationMinutes = endMinutes - startMinutes;
                            if (durationMinutes < 0) {
                                durationHours--;
                                durationMinutes += 60;
                            }
                            
                            patternEnd = DateTime.fromMillis(patternStart)
                                .plus({hours: durationHours, minutes: durationMinutes});

                            // If there's a differentEndDatePattern, adjust the end date
                            // This check is now inside the `exists(instance.endTime)` block
                            // because if endTime is NULL, differentEndDatePattern must also be NULL.
                            if (instance.differentEndDatePattern !== NULL) {
                                ASSERT(type(instance.differentEndDatePattern, Int));
                                ASSERT(instance.differentEndDatePattern > 0);
                                patternEnd = patternEnd.plus({days: instance.differentEndDatePattern})
                                    .set({
                                        hour: instance.endTime.hour, // endTime must exist if differentEndDatePattern exists
                                        minute: instance.endTime.minute // endTime must exist if differentEndDatePattern exists
                                    });
                            }
                            patternEnd = patternEnd.toMillis();
                        } else {
                            // Default 1 hour duration if no endTime.
                            // differentEndDatePattern must be NULL here.
                            patternEnd = DateTime.fromMillis(patternStart).plus({hours: 1}).toMillis();
                        }
                        
                        // Check if this event instance overlaps with current day
                        if ((patternStart >= startOfDay && patternStart <= endOfDay) || 
                            (patternEnd >= startOfDay && patternEnd <= endOfDay) ||
                            (patternStart <= startOfDay && patternEnd >= endOfDay)) {
                            
                            filteredInstances.push({
                                startDate: patternStart,
                                differentEndDate: patternEnd,
                                wrapToPreviousDay: patternStart < startOfDay,
                                wrapToNextDay: patternEnd > endOfDay,
                                completeTask: false // Events don't have complete state
                            });
                        }
                    }
                }
            }
        } else if (type(obj.data, ReminderData)) {
            // Handle reminders
            for (let instance of obj.data.instances) {
                ASSERT(type(instance, Union(NonRecurringReminderInstance, RecurringReminderInstance)));

                if (!exists(instance.time)) { // All-day reminder
                    if (type(instance, NonRecurringReminderInstance)) {
                        ASSERT(type(instance.date, DateField));
                        let reminderDate = DateTime.local(instance.date.year, instance.date.month, instance.date.day);
                        if (reminderDate.hasSame(dayTime, 'day')) {
                            filteredAllDayInstances.push({ 
                                startDate: day, 
                                faded: false, 
                                isReminder: true, 
                                name: obj.name // Store name for display
                            });
                        }
                    } else { // Recurring all-day reminder
                        let reminderDayStart = dayTime.startOf('day').toMillis();
                        let reminderDayEnd = dayTime.endOf('day').toMillis();
                        let patternInstances = generateInstancesFromPattern(instance, reminderDayStart, reminderDayEnd);
                        if (patternInstances.length > 0) {
                            filteredAllDayInstances.push({
                                startDate: day,
                                faded: false,
                                isReminder: true,
                                name: obj.name // Store name for display
                            });
                        }
                    }
                } else { // Timed reminder
                    if (type(instance, NonRecurringReminderInstance)) {
                        ASSERT(type(instance.date, DateField));
                        let reminderDateTime = DateTime.local(instance.date.year, instance.date.month, instance.date.day)
                                                    .set({ hour: instance.time.hour, minute: instance.time.minute });
                        let reminderStartMs = reminderDateTime.toMillis();
                        // Reminders are points in time, let's give them a 1-hour visual duration for now
                        let reminderEndMs = reminderDateTime.plus({ hours: 1 }).toMillis(); 

                        if ((reminderStartMs >= startOfDay && reminderStartMs <= endOfDay) ||
                            (reminderEndMs >= startOfDay && reminderEndMs <= endOfDay) ||
                            (reminderStartMs <= startOfDay && reminderEndMs >= endOfDay)) {
                            filteredInstances.push({
                                startDate: reminderStartMs,
                                differentEndDate: reminderEndMs, // Treat as 1hr block for vis
                                wrapToPreviousDay: reminderStartMs < startOfDay,
                                wrapToNextDay: reminderEndMs > endOfDay,
                                completeTask: false, // Not applicable
                                isReminder: true,
                                name: obj.name // Store name for display
                            });
                        }
                    } else { // Recurring timed reminder
                        let dayBefore = dayTime.minus({ days: 1 }).startOf('day').toMillis();
                        let dayAfter = dayTime.plus({ days: 1 }).endOf('day').toMillis();
                        let patternInstances = generateInstancesFromPattern(instance, dayBefore, dayAfter);

                        for (let patternStart of patternInstances) {
                            // Reminders are points in time, give 1-hour visual duration
                            let patternEnd = DateTime.fromMillis(patternStart).plus({ hours: 1 }).toMillis();

                            if ((patternStart >= startOfDay && patternStart <= endOfDay) ||
                                (patternEnd >= startOfDay && patternEnd <= endOfDay) ||
                                (patternStart <= startOfDay && patternEnd >= endOfDay)) {
                                filteredInstances.push({
                                    startDate: patternStart,
                                    differentEndDate: patternEnd,
                                    wrapToPreviousDay: patternStart < startOfDay,
                                    wrapToNextDay: patternEnd > endOfDay,
                                    completeTask: false, // Not applicable
                                    isReminder: true,
                                    name: obj.name // Store name for display
                                });
                            }
                        }
                    }
                }
            }
        } else {
            ASSERT(false, "Unknown kind of task/event/reminder");
        }
    }

    // adjust day element height and vertical pos to fit all day events at the top (below text but above hour markers)
    const allDayEventHeight = 18; // height in px for each all-day event
    const totalAllDayEventsHeight = filteredAllDayInstances.length * allDayEventHeight + 2; // 2px margin
    
    // Get the current height and position
    let currentHeight = parseFloat(HTML.getStyle(element, 'height').slice(0, -2));
    let currentTop = parseFloat(HTML.getStyle(element, 'top').slice(0, -2));
    
    // Adjust the height to account for all-day events
    let newHeight = currentHeight - totalAllDayEventsHeight;
    let newTop = currentTop + totalAllDayEventsHeight;
    
    // Update the element's style
    HTML.setStyle(element, {
        height: String(newHeight) + 'px',
        top: String(newTop) + 'px'
    });
    
    // Now update all the hour markers and hour marker text
    for (let j = 0; j < 24; j++) {
        // Calculate new positions based on adjusted height and top
        let hourPosition = newTop + (j * newHeight / 24);
        
        if (j > 0) { // Update hour marker positions (excluding first hour which doesn't have a marker)
            let hourMarker = HTML.getUnsafely(`day${index}hourMarker${j}`);
            if (exists(hourMarker)) {
                HTML.setStyle(hourMarker, {
                    top: String(hourPosition) + 'px'
                });
            }
        }
        
        // Update hour marker text positions
        let hourMarkerText = HTML.getUnsafely(`day${index}hourMarkerText${j}`);
        if (exists(hourMarkerText)) {
            HTML.setStyle(hourMarkerText, {
                top: String(hourPosition + 2) + 'px'
            });
        }
    }
    
    // Render the all-day events
    for (let i = 0; i < filteredAllDayInstances.length; i++) {
        let allDayEvent = filteredAllDayInstances[i];
        let allDayEventTop = currentTop + (i * allDayEventHeight);
        
        // Create or update an all-day event element
        let allDayEventElement = HTML.getUnsafely(`day${index}allDayEvent${i}`);
        if (!exists(allDayEventElement)) {
            allDayEventElement = HTML.make('div');
            HTML.setId(allDayEventElement, `day${index}allDayEvent${i}`);
            HTML.body.appendChild(allDayEventElement);
        }
        
        // Style the all-day event
        HTML.setStyle(allDayEventElement, {
            position: 'fixed',
            width: String(columnWidth - 6.5) + 'px', // Slight margin from edges
            height: String(allDayEventHeight - 2) + 'px', // Slight vertical margin
            top: String(allDayEventTop) + 'px',
            left: String(parseInt(HTML.getStyle(element, 'left').slice(0, -2)) + 4.5) + 'px',
            backgroundColor: allDayEvent.isReminder ? user.palette.accent[0] : user.palette.shades[2], // Different color for reminders
            opacity: String(allDayEvent.faded ? 0.5 : 1),
            borderRadius: '3px',
            zIndex: '350'
        });
        HTML.setHoverStyle(allDayEventElement, {
            opacity: 1
        });
    }
    
    // Remove any extra all-day event elements if there are fewer events this time
    let existingAllDayEventIndex = filteredAllDayInstances.length;
    let existingAllDayEvent = HTML.getUnsafely(`day${index}allDayEvent${existingAllDayEventIndex}`);
    while (exists(existingAllDayEvent)) {
        existingAllDayEvent.remove();
        existingAllDayEventIndex++;
        existingAllDayEvent = HTML.getUnsafely(`day${index}allDayEvent${existingAllDayEventIndex}`);
    }
}

let topOfCalendarDay = 20; // px

function renderCalendar(days) {
    ASSERT(type(days, List(DateField)));
    ASSERT(exists(user.settings) && exists(user.settings.numberOfCalendarDays) && days.length == user.settings.numberOfCalendarDays, "renderCalendar days must be an array of length user.settings.numberOfCalendarDays");
    ASSERT(type(user.settings.stacking, Boolean));
    for (let i = 0; i < 7; i++) {
        if (i >= user.settings.numberOfCalendarDays) { // delete excess elements if they exist
            // day element
            let dayElement = HTML.getUnsafely('day' + String(i));
            if (dayElement != null) {
                dayElement.remove();
            }
            // hour markers
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
            // backgrounds
            let backgroundElement = HTML.getUnsafely('day' + String(i) + 'Background');
            if (exists(backgroundElement)) {
                backgroundElement.remove();
            }
            // date text
            let dateText = HTML.getUnsafely('day' + String(i) + 'DateText');
            if (exists(dateText)) {
                dateText.remove();
            }
            // day of week text 
            let dayOfWeekText = HTML.getUnsafely('day' + String(i) + 'DayOfWeekText');
            if (exists(dayOfWeekText)) {
                dayOfWeekText.remove();
            }

            continue;
        }

        let dayElement = HTML.getUnsafely('day' + String(i));
        if (!exists(dayElement)) {
            dayElement = HTML.make('div'); // create new element
            HTML.setId(dayElement, 'day' + String(i));
        }

        let height = window.innerHeight - (2 * windowBorderMargin) - headerSpace - topOfCalendarDay;
        let top = windowBorderMargin + headerSpace + topOfCalendarDay;
        let left = windowBorderMargin + ((columnWidth + gapBetweenColumns) * (i+1));
        if (user.settings.stacking) {
            // half the height, then subtract margin between calendar days
            height = (window.innerHeight - headerSpace - (2 * windowBorderMargin) - gapBetweenColumns)/2 - topOfCalendarDay;
            height -= 1; // manual adjustment, not sure why it's off by 1
            if (i >= Math.floor(user.settings.numberOfCalendarDays / 2)) { // bottom half
                top += height + gapBetweenColumns + topOfCalendarDay;
                
                // if the number of days is even, bottom is same as top
                if (user.settings.numberOfCalendarDays % 2 == 0) {
                    left = windowBorderMargin + ((columnWidth + gapBetweenColumns) * (i - Math.floor(user.settings.numberOfCalendarDays / 2) + 1));
                } else {
                    left = windowBorderMargin + ((columnWidth + gapBetweenColumns) * (i - Math.floor(user.settings.numberOfCalendarDays / 2)));
                }
            } else { // top half
                left = windowBorderMargin + ((columnWidth + gapBetweenColumns) * (i + 1));
            }
        }

        HTML.setStyle(dayElement, {
            position: 'fixed',
            width: String(columnWidth) + 'px',
            height: String(height) + 'px',
            top: String(top) + 'px',
            left: String(left) + 'px',
            border: '1px solid ' + user.palette.shades[3],
            borderRadius: '5px',
            backgroundColor: user.palette.shades[0],
            zIndex: '300' // below hour markers
        });
        HTML.body.appendChild(dayElement);

        // add background element which is the same but with lower z index
        let backgroundElement = HTML.getUnsafely('day' + String(i) + 'Background');
        if (!exists(backgroundElement)) {
            backgroundElement = HTML.make('div');
            HTML.setId(backgroundElement, 'day' + String(i) + 'Background');
        }

        let topOfBackground = windowBorderMargin + headerSpace;
        if (user.settings.stacking && i >= Math.floor(user.settings.numberOfCalendarDays / 2)) { // in bottom half
            topOfBackground = top - topOfCalendarDay; // height of top half + gap
        }

        HTML.setStyle(backgroundElement, {
            position: 'fixed',
            width: String(columnWidth) + 'px',
            height: String(height + topOfCalendarDay) + 'px',
            top: String(topOfBackground) + 'px',
            left: String(left) + 'px',
            backgroundColor: user.palette.shades[1],
            border: '1px solid ' + user.palette.shades[3],
            borderRadius: '5px',
            zIndex: '200', // below dayElement
        });
        HTML.body.appendChild(backgroundElement);

        // add MM-DD text to top right of background element
        let dateText = HTML.getUnsafely('day' + String(i) + 'DateText');
        if (!exists(dateText)) {
            dateText = HTML.make('div');
            HTML.setId(dateText, 'day' + String(i) + 'DateText');
        }
        let dateAndDayOfWeekSpacing = 3.5;
        let dateAndDayOfWeekVerticalPos = top - topOfCalendarDay + dateAndDayOfWeekSpacing;
        HTML.setStyle(dateText, {
            position: 'fixed',
            top: String(dateAndDayOfWeekVerticalPos) + 'px',
            right: String(window.innerWidth - left - columnWidth + dateAndDayOfWeekSpacing) + 'px',
            fontSize: '12px',
            color: user.palette.shades[3],
            fontFamily: 'Inter',
            fontWeight: 'bold',
            zIndex: '400'
        });
        
        // Create DateField from the ISO string
        let month = String(days[i].month);
        let day = String(days[i].day);
        
        // Remove leading zeros if present
        if (day[0] == '0') {
            day = day[1];
        }
        if (month[0] == '0') {
            month = month[1];
        }
        
        dateText.innerHTML = month + '/' + day;
        HTML.body.appendChild(dateText);

        // add dayOfWeekOrRelativeDay text to top left of background element
        let dayOfWeekText = HTML.getUnsafely('day' + String(i) + 'DayOfWeekText');
        if (!exists(dayOfWeekText)) {
            dayOfWeekText = HTML.make('div');
            HTML.setId(dayOfWeekText, 'day' + String(i) + 'DayOfWeekText');
        }
        HTML.setStyle(dayOfWeekText, {
            position: 'fixed',
            top: String(dateAndDayOfWeekVerticalPos) + 'px',
            left: String(left + 4) + 'px',
            fontSize: '12px',
            color: user.palette.shades[3],
            fontFamily: 'Inter',
            fontWeight: 'bold',
            zIndex: '400'
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

function render() {
    columnWidth = ((window.innerWidth - (2*windowBorderMargin) - gapBetweenColumns*(numberOfColumns() - 1)) / numberOfColumns()); // 1 fewer gaps than columns
    ASSERT(!isNaN(columnWidth), "columnWidth must be a float");
    renderCalendar(currentDays());
}

function toggleNumberOfCalendarDays() {
    ASSERT(type(user.settings.numberOfCalendarDays, Int));
    ASSERT(1 <= user.settings.numberOfCalendarDays && user.settings.numberOfCalendarDays <= 7);
    
    // looping from 1 to 7 incrementing by 1
    if (user.settings.numberOfCalendarDays === 7) {
        user.settings.numberOfCalendarDays = 1;
    } else {
        user.settings.numberOfCalendarDays++;
    }
    saveUserData(user);

    let buttonNumberCalendarDays = HTML.get('buttonNumberCalendarDays');
    buttonNumberCalendarDays.innerHTML = 'Toggle Number of Calendar Days: ' + user.settings.numberOfCalendarDays;
    render();
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
ASSERT(type(user.settings.numberOfCalendarDays, Int));
ASSERT(1 <= user.settings.numberOfCalendarDays && user.settings.numberOfCalendarDays <= 7);
buttonNumberCalendarDays.innerHTML = 'Toggle Number of Calendar Days: ' + user.settings.numberOfCalendarDays;
buttonNumberCalendarDays.onclick = toggleNumberOfCalendarDays;
HTML.body.appendChild(buttonNumberCalendarDays);

function toggleAmPmOr24() {
    ASSERT(type(user.settings.ampmOr24, String));
    ASSERT(user.settings.ampmOr24 == 'ampm' || user.settings.ampmOr24 == '24');
    if (user.settings.ampmOr24 == 'ampm') {
        user.settings.ampmOr24 = '24';
    } else {
        user.settings.ampmOr24 = 'ampm';
    }
    saveUserData(user);

    let buttonAmPmOr24 = HTML.get('buttonAmPmOr24');
    buttonAmPmOr24.innerHTML = 'Toggle 12 Hour or 24 Hour Time';
    
    // update all hour markers
    for (let i = 0; i < user.settings.numberOfCalendarDays; i++) {
        for (let j = 0; j < 24; j++) {
            let hourMarkerText = HTML.get(`day${i}hourMarkerText${j}`);
            hourMarkerText.innerHTML = nthHourText(j);
            let fontSize;
            if (user.settings.ampmOr24 == 'ampm') {
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

function toggleStacking() {
    ASSERT(type(user.settings.stacking, Boolean));
    user.settings.stacking = !user.settings.stacking;
    saveUserData(user);
    render();
}

let buttonStacking = HTML.make('div');
HTML.setId(buttonStacking, 'buttonStacking');
HTML.setStyle(buttonStacking, {
    position: 'fixed',
    top: windowBorderMargin + 'px',
    // logo width + window border margin*2
    left: String(100 + windowBorderMargin*2 + 450) + 'px',
    backgroundColor: user.palette.shades[1],
    fontSize: '12px',
    color: user.palette.shades[3],
});
buttonStacking.onclick = toggleStacking;
buttonStacking.innerHTML = 'Toggle Stacking';
HTML.body.appendChild(buttonStacking);

window.onresize = render;

// init call
render();