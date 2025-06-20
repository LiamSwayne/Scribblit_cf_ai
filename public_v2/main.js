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

    // --- Start of relative date definitions for sample data ---
    const baseDate = DateTime.local(); // Use a single base for all calculations

    const today = new DateField(baseDate.year, baseDate.month, baseDate.day);

    const tomorrowDate = baseDate.plus({days: 1});
    const tomorrow = new DateField(tomorrowDate.year, tomorrowDate.month, tomorrowDate.day);

    const in3DaysDate = baseDate.plus({days: 3});
    const in3Days = new DateField(in3DaysDate.year, in3DaysDate.month, in3DaysDate.day);
    
    const in5DaysDate = baseDate.plus({days: 5});
    const in5Days = new DateField(in5DaysDate.year, in5DaysDate.month, in5DaysDate.day);

    const in1WeekDate = baseDate.plus({days: 7});
    const in1Week = new DateField(in1WeekDate.year, in1WeekDate.month, in1WeekDate.day);

    const in1WeekPlus2DaysDate = in1WeekDate.plus({days: 2});
    const in1WeekPlus2Days = new DateField(in1WeekPlus2DaysDate.year, in1WeekPlus2DaysDate.month, in1WeekPlus2DaysDate.day);

    const in2WeeksDate = baseDate.plus({days: 14});
    const in2Weeks = new DateField(in2WeeksDate.year, in2WeeksDate.month, in2WeeksDate.day);
    
    const in1MonthDate = baseDate.plus({months: 1});
    const in1Month = new DateField(in1MonthDate.year, in1MonthDate.month, in1MonthDate.day);
    
    const in2MonthsDate = baseDate.plus({months: 2});
    const in2Months = new DateField(in2MonthsDate.year, in2MonthsDate.month, in2MonthsDate.day);

    // Calculate next Saturday for event-004
    let nextSaturdayDateCalc = baseDate;
    while(nextSaturdayDateCalc.weekday !== 6) { // Luxon: Saturday is 6
        nextSaturdayDateCalc = nextSaturdayDateCalc.plus({days: 1});
    }
    const nextSaturday = new DateField(nextSaturdayDateCalc.year, nextSaturdayDateCalc.month, nextSaturdayDateCalc.day);
    // --- End of relative date definitions ---

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
                        in1Week, // date
                        new TimeField(23, 59), // dueTime
                        [] // completion
                    )
                ], // instances
                NULL, // hideUntil
                true, // showOverdue
                [
                    new NonRecurringEventInstance(
                        in5Days, // startDate
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
                            today, // initialDate
                            7 // n
                        ), // datePattern
                        new TimeField(17, 0), // dueTime
                        new DateRange(
                            today, // startDate
                            in2Months // endDate
                        ), // range
                        [] // completion
                    )
                ], // instances
                NULL, // hideUntil
                true, // showOverdue
                [
                    new RecurringEventInstance(
                        new EveryNDaysPattern(
                            today, // initialDate
                            7 // n
                        ), // startDatePattern
                        new TimeField(14, 0), // startTime
                        new TimeField(15, 0), // endTime
                        new DateRange(
                            today, // startDate
                            in2Months // endDate
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
                        new MonthlyPattern(1, [true, true, true, true, true, true, true, true, true, true, true, true]), // datePattern (1st of every month)
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
                        tomorrow, // startDate
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
                            today, // initialDate
                            1 // n
                        ), // startDatePattern
                        new TimeField(9, 30), // startTime
                        new TimeField(10, 0), // endTime
                        new DateRange(
                            today, // startDate
                            in2Weeks // endDate
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
                        in1Week, // startDate
                        new TimeField(9, 0), // startTime
                        new TimeField(17, 0), // endTime
                        in1WeekPlus2Days // differentEndDate
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
                            nextSaturday, // initialDate
                            7 // n
                        ), // startDatePattern
                        new TimeField(10, 0), // startTime
                        new TimeField(16, 0), // endTime
                        new RecurrenceCount(4), // range
                        1 // differentEndDatePattern (e.g. workshop lasts 2 days, so end is start + 1 day)
                    )
                ] // instances
            ) // data
        ),

        // Non-recurring timed reminder
        new Entity(
            'reminder-001',
            'Call Alex re: Project Super Super Long Long Long Name',
            'Follow up on Project X deliverables',
            new ReminderData([
                new NonRecurringReminderInstance(
                    tomorrow, // date
                    new TimeField(14, 30)
                )
            ])
        ),

        // this reminder overlaps with the previous one
        new Entity(
            'reminder-999',
            'Call Alex 2: Electric Boogaloo',
            '',
            new ReminderData([
                new NonRecurringReminderInstance(
                    tomorrow, // date
                    new TimeField(14, 30)
                )
            ])
        ),

        // this reminder overlaps with the previous one
        new Entity(
            'reminder-998',
            'Third',
            '',
            new ReminderData([
                new NonRecurringReminderInstance(
                    tomorrow, // date
                    new TimeField(14, 30)
                )
            ])
        ),

        new Entity(
            'reminder-101',
            'Double reminder',
            '',
            new ReminderData([
                new NonRecurringReminderInstance(
                    tomorrow, // date
                    new TimeField(10, 30)
                )
            ])
        ),

        new Entity(
            'reminder-102',
            'Double reminder',
            '',
            new ReminderData([
                new NonRecurringReminderInstance(
                    tomorrow, // date
                    new TimeField(10, 30)
                )
            ])
        ),

        new Entity(
            'reminder-103',
            'Quadruple reminder',
            '',
            new ReminderData([
                new NonRecurringReminderInstance(
                    tomorrow, // date
                    new TimeField(19, 30)
                )
            ])
        ),

        new Entity(
            'reminder-104',
            'Quadruple reminder',
            '',
            new ReminderData([
                new NonRecurringReminderInstance(
                    tomorrow, // date
                    new TimeField(19, 30)
                )
            ])
        ),

        new Entity(
            'reminder-105',
            'Quadruple reminder',
            '',
            new ReminderData([
                new NonRecurringReminderInstance(
                    tomorrow, // date
                    new TimeField(19, 30)
                )
            ])
        ),

        new Entity(
            'reminder-106',
            'Quadruple reminder',
            '',
            new ReminderData([
                new NonRecurringReminderInstance(
                    tomorrow, // date
                    new TimeField(19, 30)
                )
            ])
        ),

        new Entity(
            'reminder-107',
            'Pentuple reminder',
            '',
            new ReminderData([
                new NonRecurringReminderInstance(
                    tomorrow, // date
                    new TimeField(20, 15)
                )
            ])
        ),

        new Entity(
            'reminder-108',
            'pentuple reminder',
            '',
            new ReminderData([
                new NonRecurringReminderInstance(
                    tomorrow, // date
                    new TimeField(20, 15)
                )
            ])
        ),

        new Entity(
            'reminder-109',
            'pentuple reminder',
            '',
            new ReminderData([
                new NonRecurringReminderInstance(
                    tomorrow, // date
                    new TimeField(20, 15)
                )
            ])
        ),

        new Entity(
            'reminder-110',
            'pentuple reminder',
            '',
            new ReminderData([
                new NonRecurringReminderInstance(
                    tomorrow, // date
                    new TimeField(20, 15)
                )
            ])
        ),

        new Entity(
            'reminder-111',
            'pentuple reminder',
            '',
            new ReminderData([
                new NonRecurringReminderInstance(
                    tomorrow, // date
                    new TimeField(20, 15)
                )
            ])
        ),

        new Entity(
            'reminder-112',
            'sextuple reminder',
            '',
            new ReminderData([
                new NonRecurringReminderInstance(
                    tomorrow, // date
                    new TimeField(21, 15)
                )
            ])
        ),

        new Entity(
            'reminder-113',
            'sextuple reminder',
            '',
            new ReminderData([
                new NonRecurringReminderInstance(
                    tomorrow, // date
                    new TimeField(21, 15)
                )
            ])
        ),

        new Entity(
            'reminder-114',
            'sextuple reminder',
            '',
            new ReminderData([
                new NonRecurringReminderInstance(
                    tomorrow, // date
                    new TimeField(21, 15)
                )
            ])
        ),

        new Entity(
            'reminder-115',
            'sextuple reminder',
            '',
            new ReminderData([
                new NonRecurringReminderInstance(
                    tomorrow, // date
                    new TimeField(21, 15)
                )
            ])
        ),

        new Entity(
            'reminder-116',
            'sextuple reminder',
            '',
            new ReminderData([
                new NonRecurringReminderInstance(
                    tomorrow, // date
                    new TimeField(21, 15)
                )
            ])
        ),

        new Entity(
            'reminder-117',
            'sextuple reminder',
            '',
            new ReminderData([
                new NonRecurringReminderInstance(
                    tomorrow, // date
                    new TimeField(21, 15)
                )
            ])
        ),

        // Recurring daily reminder for 3 occurrences
        new Entity(
            'reminder-002',
            'Water Plants',
            'Daily reminder for indoor plants',
            new ReminderData([
                new RecurringReminderInstance(
                    new EveryNDaysPattern(today, 1), // Daily starting today
                    new TimeField(9, 0),
                    new RecurrenceCount(3) // For 3 days
                ),
                new RecurringReminderInstance(
                    new EveryNDaysPattern(today, 1), // Daily starting today
                    new TimeField(21, 0),
                    new RecurrenceCount(3) // For 3 days
                )
            ])
        ),

        new Entity(
            'reminder-003',
            "Human's Birthday",
            "Don't forget to send wishes!",
            new ReminderData([
                new NonRecurringReminderInstance(
                    in3Days, // date
                    new TimeField(10, 0)
                )
            ])
        ),

        new Entity(
            'reminder-400',
            "Thing that happens today and tomorrow",
            "Don't forget to send wishes!",
            new ReminderData([
                new NonRecurringReminderInstance(
                    today, // date
                    new TimeField(5, 0)
                ),
                new NonRecurringReminderInstance(
                    tomorrow, // date
                    new TimeField(5, 0)
                )
            ])
        ),

        new Entity(
            'reminder-200',
            "Accent 0",
            "Don't forget to send wishes!",
            new ReminderData([
                new NonRecurringReminderInstance(
                    tomorrow, // date
                    new TimeField(21, 25)
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

function applyPalette(palette) {
    ASSERT(type(palette, Dict(String, List(String))));
    const root = document.documentElement;
    palette.shades.forEach((shade, index) => {
        root.style.setProperty(`--shade-${index}`, shade);
    });
    palette.accent.forEach((accent, index) => {
        root.style.setProperty(`--accent-${index}`, accent);
    });
}

let user = loadUserData();
applyPalette(user.palette);
// Set firstDayInCalendar to today on page load
firstDayInCalendar = getDayNDaysFromToday(0);
ASSERT(type(user, User));

let gapBetweenColumns = 6;
let windowBorderMargin = 6;
let columnWidth; // portion of screen
let headerSpace = 26; // px gap at top to make space for logo and buttons

const indexIncreaseOnHover = 1441; // 1440 minutes in a day, so this way it must be on top of all other reminders

let adjustCalendarUp; // px to adjust calendar up by based on browser
if (navigator.userAgent.toLowerCase().indexOf('firefox') > -1) {
    adjustCalendarUp = 0;
} else {
    adjustCalendarUp = 2;
}

let G_reminderDragState = {
    isDragging: false,
    dayIndex: -1,
    groupIndex: -1,
    groupElements: [],
    initialTops: [],
    initialY: 0,
    timedAreaTop: 0,
    timedAreaHeight: 0,
    dayStartUnix: 0,
    dayEndUnix: 0,
    reminderGroup: [],
};

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
        user-select: none; /* make text not highlightable */
    }
`;
HTML.head.appendChild(styleElement);

HTML.setStyle(HTML.body, {
    backgroundColor: 'var(--shade-0)',
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

// Helper function to convert day of week string to Luxon weekday index (1-7, Mon-Sun)
function dayOfWeekStringToIndex(dayOfWeekString) {
    ASSERT(type(dayOfWeekString, DAY_OF_WEEK));
    switch (dayOfWeekString) {
        case 'monday': return 1;
        case 'tuesday': return 2;
        case 'wednesday': return 3;
        case 'thursday': return 4;
        case 'friday': return 5;
        case 'saturday': return 6;
        case 'sunday': return 7;
        default:
            ASSERT(false, `Invalid dayOfWeekString: ${dayOfWeekString}`);
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
        ASSERT(type(instance.startDatePattern, Union(EveryNDaysPattern, MonthlyPattern, AnnuallyPattern, NthWeekdayOfMonthsPattern)));
        pattern = instance.startDatePattern;
    } else if (type(instance, RecurringReminderInstance)) { // RecurringReminderInstance
        ASSERT(type(instance.datePattern, Union(EveryNDaysPattern, MonthlyPattern, AnnuallyPattern, NthWeekdayOfMonthsPattern)));
        pattern = instance.datePattern;
    } else {
        ASSERT(false, "Unknown instance type in generateInstancesFromPattern");
    }

    // Determine start date
    let startDateTime;
    if (type(instance.range, DateRange)) {
        ASSERT(type(instance.range.startDate, DateField));
        startDateTime = DateTime.local(instance.range.startDate.year, instance.range.startDate.month, instance.range.startDate.day);
    } else if (type(pattern, EveryNDaysPattern)) {
        startDateTime = DateTime.local(pattern.initialDate.year, pattern.initialDate.month, pattern.initialDate.day);
    } else {
        // For patterns like Monthly or NthWeekday, we start from the beginning of the current day
        // if no explicit start range is given. The loop will find the first valid date.
        startDateTime = DateTime.local().startOf('day');
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
        
        // default to midnight
        let hour = 0;
        let minute = 0;

        if (type(instance, RecurringTaskInstance)) {
            if (type(instance.dueTime, TimeField)) {
                hour = instance.dueTime.hour;
                minute = instance.dueTime.minute;
            }
        } else if (type(instance, RecurringEventInstance)) {
            if (type(instance.startTime, TimeField)) {
                hour = instance.startTime.hour;
                minute = instance.startTime.minute;
            }
        } else if (type(instance, RecurringReminderInstance)) {
            if (type(instance.time, TimeField)) {
                hour = instance.time.hour;
                minute = instance.time.minute;
            }
        }

        ASSERT(type(hour, Int));
        ASSERT(type(minute, Int));
        ASSERT(0 <= hour && hour < 24);
        ASSERT(0 <= minute && minute < 60);
        timestamp = currentDateTime.set({hour: hour, minute: minute}).toMillis();

        // Only add the date if it falls within the requested range (if provided)
        if ((startUnix === NULL || timestamp >= startUnix) && (endUnix === NULL || timestamp < endUnix)) {
            dates.push(timestamp);
        }

        count++;
        // Stop generating future dates if we have already passed the requested endUnix and we have fulfilled the count
        if (endUnix !== NULL && currentDateTime.toMillis() > endUnix && (type(instance.range, RecurrenceCount) ? count >= instance.range.count : true)) {
            break;
        }

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
        } else if (type(pattern, NthWeekdayOfMonthsPattern)) {
            // Logic for NthWeekdayOfMonthsPattern
            // This will be more complex as it involves finding specific weekdays within months.
            // We need to iterate through months, find the Nth occurrences of dayOfWeek.

            let foundNext = false;
            while (!foundNext && (endDateTime === NULL || currentDateTime <= endDateTime)) {
                currentDateTime = currentDateTime.plus({ days: 1 }); // Increment day by day to find the next match

                if (endDateTime !== NULL && currentDateTime > endDateTime) {
                    break; // Exceeded end date
                }

                const currentMonthIndex = currentDateTime.month - 1; // 0-indexed
                if (!pattern.months[currentMonthIndex]) {
                    // If current month is not active, skip to the next month
                    // Ensure day of month does not cause issues (e.g. Jan 31 to Feb)
                    currentDateTime = currentDateTime.plus({ months: 1 }).set({ day: 1 });
                    continue;
                }

                // Check if currentDateTime's day of week matches pattern.dayOfWeek
                // Luxon's weekday is 1 (Mon) to 7 (Sun)
                const luxonWeekday = currentDateTime.weekday;
                const patternWeekdayStr = pattern.dayOfWeek; // 'monday', 'tuesday', etc.
                let patternLuxonWeekday = dayOfWeekStringToIndex(patternWeekdayStr);

                if (luxonWeekday === patternLuxonWeekday) {
                    // It's the correct day of the week, now check if it's the Nth occurrence
                    const dayOfMonth = currentDateTime.day;
                    const weekNumberInMonth = Math.ceil(dayOfMonth / 7); // 1st, 2nd, 3rd, 4th, 5th week

                    // Check for last weekday of month (-1)
                    if (pattern.nthWeekdays[-1]) {
                        const nextSameWeekdayInMonth = currentDateTime.plus({ weeks: 1 });
                        if (nextSameWeekdayInMonth.month !== currentDateTime.month) { // currentDateTime is the last one
                             // Check if this date is after the original startDateTime of the loop to avoid double counting
                            if (currentDateTime > DateTime.fromMillis(dates[dates.length-1])) {
                                foundNext = true;
                            }
                        }
                    }

                    // Check for specific nth weekdays (1, 2, 3, 4)
                    if (pattern.nthWeekdays[weekNumberInMonth]) {
                         if (currentDateTime > DateTime.fromMillis(dates[dates.length-1])) {
                            foundNext = true;
                        }
                    }
                }
                if (currentDateTime.year > startDateTime.year + 10 && dates.length < 2) { // Prevent excessively long searches if pattern is sparse
                     log("Warning: NthWeekdayOfMonthsPattern might be too sparse or never occur. Breaking search.");
                     currentDateTime = endDateTime ? endDateTime.plus({days: 1}) : currentDateTime.plus({years: 10}); // force exit
                     break;
                }
            }
            if (!foundNext) {
                 // If no next date found within limits, effectively end the loop for this pattern
                 if (endDateTime) currentDateTime = endDateTime.plus({days: 1});
                 // else, if no endDateTime, we might have hit maxCount or an arbitrary break
            }

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

const FilteredInstancesFactory = {
    // Processes a single work session instance from a TaskEntity
    fromTaskWorkSession: function(taskEntity, workSessionInstance, workSessionPatternIndex, dayDateField, dayStartUnix, dayEndUnix) {
        const results = [];
        const entityId = taskEntity.id;
        const entityName = taskEntity.name; // Or specific name for work session if available/different
        const taskIsComplete = isTaskComplete(taskEntity.data);

        // Common properties for the instances derived from this workSessionInstance
        const originalStartDate = workSessionInstance.startDatePattern ? workSessionInstance.startDatePattern.initialDate : workSessionInstance.startDate;
        const originalStartTime = workSessionInstance.startTime;

        if (!exists(workSessionInstance.startTime)) { // All-day work session
            if (type(workSessionInstance, NonRecurringEventInstance)) {
                ASSERT(type(workSessionInstance.startDate, DateField));
                let workDate = DateTime.local(workSessionInstance.startDate.year, workSessionInstance.startDate.month, workSessionInstance.startDate.day);
                if (workDate.hasSame(DateTime.local(dayDateField.year, dayDateField.month, dayDateField.day), 'day')) {
                    results.push(new FilteredAllDayInstance(
                        entityId,
                        entityName,
                        dayDateField,
                        TaskWorkSessionKind,
                        taskIsComplete,
                        false, // ignore
                        workSessionPatternIndex
                    ));
                }
            } else { // Recurring all-day work session
                let dayPatternStartMs = DateTime.local(dayDateField.year, dayDateField.month, dayDateField.day).startOf('day').toMillis();
                let dayPatternEndMs = DateTime.local(dayDateField.year, dayDateField.month, dayDateField.day).endOf('day').toMillis();
                let patternDates = generateInstancesFromPattern(workSessionInstance, dayPatternStartMs, dayPatternEndMs);
                if (patternDates.length > 0) {
                    results.push(new FilteredAllDayInstance(
                        entityId,
                        entityName,
                        dayDateField,
                        TaskWorkSessionKind,
                        taskIsComplete,
                        false, // ignore
                        workSessionPatternIndex
                    ));
                }
            }
        } else { // Timed work session
            if (type(workSessionInstance, NonRecurringEventInstance)) {
                ASSERT(type(workSessionInstance.startDate, DateField));
                let workStartDateTime = DateTime.local(workSessionInstance.startDate.year, workSessionInstance.startDate.month, workSessionInstance.startDate.day)
                    .set({ hour: workSessionInstance.startTime.hour, minute: workSessionInstance.startTime.minute });

                let workEndDateTime;
                if (workSessionInstance.differentEndDate !== NULL) {
                    ASSERT(type(workSessionInstance.differentEndDate, DateField));
                    workEndDateTime = DateTime.local(workSessionInstance.differentEndDate.year, workSessionInstance.differentEndDate.month, workSessionInstance.differentEndDate.day)
                        .set({ hour: workSessionInstance.endTime.hour, minute: workSessionInstance.endTime.minute });
                } else {
                    workEndDateTime = DateTime.local(workSessionInstance.startDate.year, workSessionInstance.startDate.month, workSessionInstance.startDate.day)
                        .set({ hour: workSessionInstance.endTime.hour, minute: workSessionInstance.endTime.minute });
                }

                let workStartMs = workStartDateTime.toMillis();
                let workEndMs = workEndDateTime.toMillis();

                if ((workStartMs < dayEndUnix && workEndMs > dayStartUnix)) {
                    results.push(new FilteredSegmentOfDayInstance(
                        entityId,
                        entityName,
                        Math.max(workStartMs, dayStartUnix),
                        Math.min(workEndMs, dayEndUnix),
                        originalStartDate,
                        originalStartTime,
                        workStartMs < dayStartUnix,
                        workEndMs > dayEndUnix,
                        TaskWorkSessionKind,
                        taskIsComplete,
                        workSessionPatternIndex
                    ));
                }
            } else { // Recurring timed work session
                let dayBeforeMs = DateTime.local(dayDateField.year, dayDateField.month, dayDateField.day).minus({ days: 1 }).startOf('day').toMillis();
                let dayAfterMs = DateTime.local(dayDateField.year, dayDateField.month, dayDateField.day).plus({ days: 1 }).endOf('day').toMillis();
                let patternStartTimes = generateInstancesFromPattern(workSessionInstance, dayBeforeMs, dayAfterMs);

                for (let startMs of patternStartTimes) {
                    let instanceStartDateTime = DateTime.fromMillis(startMs);
                    let instanceEndDateTime;

                    if (workSessionInstance.differentEndDatePattern === NULL) {
                        instanceEndDateTime = instanceStartDateTime.set({ hour: workSessionInstance.endTime.hour, minute: workSessionInstance.endTime.minute });
                    } else {
                        instanceEndDateTime = instanceStartDateTime.plus({ days: workSessionInstance.differentEndDatePattern })
                            .set({ hour: workSessionInstance.endTime.hour, minute: workSessionInstance.endTime.minute });
                    }
                    let endMs = instanceEndDateTime.toMillis();

                    if (startMs < dayEndUnix && endMs > dayStartUnix) {
                         results.push(new FilteredSegmentOfDayInstance(
                            entityId,
                            entityName,
                            Math.max(startMs, dayStartUnix),
                            Math.min(endMs, dayEndUnix),
                            originalStartDate, // This is the pattern's initial date
                            originalStartTime, // This is the pattern's start time
                            startMs < dayStartUnix,
                            endMs > dayEndUnix,
                            TaskWorkSessionKind,
                            taskIsComplete,
                            workSessionPatternIndex
                        ));
                    }
                }
            }
        }
        return results;
    },

    fromEvent: function(eventEntity, eventInstance, eventPatternIndex, dayDateField, dayStartUnix, dayEndUnix) {
        const results = [];
        const entityId = eventEntity.id;
        const entityName = eventEntity.name;

        const originalStartDate = eventInstance.startDatePattern ? eventInstance.startDatePattern.initialDate : eventInstance.startDate;
        const originalStartTime = eventInstance.startTime;

        if (!exists(eventInstance.startTime)) { // All-day event
            if (type(eventInstance, NonRecurringEventInstance)) {
                ASSERT(type(eventInstance.startDate, DateField));
                let eventDate = DateTime.local(eventInstance.startDate.year, eventInstance.startDate.month, eventInstance.startDate.day);
                if (eventDate.hasSame(DateTime.local(dayDateField.year, dayDateField.month, dayDateField.day), 'day')) {
                    results.push(new FilteredAllDayInstance(
                        entityId,
                        entityName,
                        dayDateField,
                        EventInstanceKind,
                        NULL, // taskIsComplete
                        false, // ignore
                        eventPatternIndex
                    ));
                }
            } else { // Recurring all-day event
                let dayPatternStartMs = DateTime.local(dayDateField.year, dayDateField.month, dayDateField.day).startOf('day').toMillis();
                let dayPatternEndMs = DateTime.local(dayDateField.year, dayDateField.month, dayDateField.day).endOf('day').toMillis();
                let patternDates = generateInstancesFromPattern(eventInstance, dayPatternStartMs, dayPatternEndMs);
                if (patternDates.length > 0) {
                    results.push(new FilteredAllDayInstance(
                        entityId,
                        entityName,
                        dayDateField,
                        EventInstanceKind,
                        NULL, // taskIsComplete
                        false, // ignore
                        eventPatternIndex
                    ));
                }
            }
        } else { // Timed event
            if (type(eventInstance, NonRecurringEventInstance)) {
                ASSERT(type(eventInstance.startDate, DateField));
                let eventStartDateTime = DateTime.local(eventInstance.startDate.year, eventInstance.startDate.month, eventInstance.startDate.day)
                    .set({ hour: eventInstance.startTime.hour, minute: eventInstance.startTime.minute });

                let eventEndDateTime;
                if (eventInstance.endTime === NULL) {
                    eventEndDateTime = eventStartDateTime.plus({ minutes: 100 }); // Default duration
                } else {
                    if (eventInstance.differentEndDate !== NULL) {
                        ASSERT(type(eventInstance.differentEndDate, DateField));
                        eventEndDateTime = DateTime.local(eventInstance.differentEndDate.year, eventInstance.differentEndDate.month, eventInstance.differentEndDate.day)
                            .set({ hour: eventInstance.endTime.hour, minute: eventInstance.endTime.minute });
                    } else {
                        eventEndDateTime = DateTime.local(eventInstance.startDate.year, eventInstance.startDate.month, eventInstance.startDate.day)
                            .set({ hour: eventInstance.endTime.hour, minute: eventInstance.endTime.minute });
                    }
                }
                let eventStartMs = eventStartDateTime.toMillis();
                let eventEndMs = eventEndDateTime.toMillis();

                if (eventStartMs < dayEndUnix && eventEndMs > dayEndUnix) {
                    results.push(new FilteredSegmentOfDayInstance(
                        entityId,
                        entityName,
                        Math.max(eventStartMs, dayStartUnix),
                        Math.min(eventEndMs, dayEndUnix),
                        originalStartDate,
                        originalStartTime,
                        eventStartMs < dayStartUnix,
                        eventEndMs > dayEndUnix,
                        EventInstanceKind,
                        NULL, // taskIsComplete
                        eventPatternIndex
                    ));
                }
            } else { // Recurring timed event
                let dayBeforeMs = DateTime.local(dayDateField.year, dayDateField.month, dayDateField.day).minus({ days: 1 }).startOf('day').toMillis();
                let dayAfterMs = DateTime.local(dayDateField.year, dayDateField.month, dayDateField.day).plus({ days: 1 }).endOf('day').toMillis();
                let patternStartTimes = generateInstancesFromPattern(eventInstance, dayBeforeMs, dayAfterMs);

                for (let startMs of patternStartTimes) {
                    let instanceStartDateTime = DateTime.fromMillis(startMs);
                    let instanceEndDateTime;

                    if (exists(eventInstance.endTime)) {
                        let durationHours = eventInstance.endTime.hour - eventInstance.startTime.hour;
                        let durationMinutes = eventInstance.endTime.minute - eventInstance.startTime.minute;
                        if (durationMinutes < 0) {
                            durationHours--;
                            durationMinutes += 60;
                        }
                        instanceEndDateTime = instanceStartDateTime.plus({ hours: durationHours, minutes: durationMinutes });

                        if (eventInstance.differentEndDatePattern !== NULL) {
                            ASSERT(type(eventInstance.differentEndDatePattern, Int) && eventInstance.differentEndDatePattern >= 0);
                             instanceEndDateTime = instanceStartDateTime.plus({days: eventInstance.differentEndDatePattern})
                                .set({
                                    hour: eventInstance.endTime.hour,
                                    minute: eventInstance.endTime.minute
                                });
                        }
                    } else {
                        instanceEndDateTime = instanceStartDateTime.plus({ hours: 1 }); // Default 1 hour duration
                    }
                    let endMs = instanceEndDateTime.toMillis();
                    
                    if (startMs < dayEndUnix && endMs > dayStartUnix) {
                        results.push(new FilteredSegmentOfDayInstance(
                            entityId,
                            entityName,
                            Math.max(startMs, dayStartUnix),
                            Math.min(endMs, dayEndUnix),
                            originalStartDate, // Pattern's initial date
                            originalStartTime, // Pattern's start time
                            startMs < dayStartUnix,
                            endMs > dayEndUnix,
                            EventInstanceKind,
                            NULL, // taskIsComplete
                            eventPatternIndex
                        ));
                    }
                }
            }
        }
        return results;
    },

    fromReminder: function(reminderEntity, reminderInstance, reminderPatternIndex, dayDateField, dayStartUnix, dayEndUnix) {
        const results = [];
        const entityId = reminderEntity.id;
        const entityName = reminderEntity.name;

        const originalDate = reminderInstance.datePattern ? reminderInstance.datePattern.initialDate : reminderInstance.date;
        // reminderInstance.time is now guaranteed to be a TimeField
        const originalTime = reminderInstance.time;

        if (type(reminderInstance, NonRecurringReminderInstance)) {
            ASSERT(type(reminderInstance.date, DateField));
            let reminderDateTime = DateTime.local(reminderInstance.date.year, reminderInstance.date.month, reminderInstance.date.day)
                .set({ hour: reminderInstance.time.hour, minute: reminderInstance.time.minute });
            let reminderStartMs = reminderDateTime.toMillis();

            // Check if the reminder falls within the current day
            if (reminderStartMs >= dayStartUnix && reminderStartMs < dayEndUnix) {
                 results.push(new FilteredReminderInstance(
                    entityId,
                    entityName,
                    reminderStartMs,
                    originalDate,
                    originalTime,
                    // false, // isAllDay - removed
                    reminderPatternIndex
                ));
            }
        } else { // RecurringReminderInstance
            // For recurring timed reminders, generateInstancesFromPattern gives the exact time.
            // We only care about instances that fall exactly on dayDateField.
            let patternStartTimes = generateInstancesFromPattern(reminderInstance, dayStartUnix, dayEndUnix);

            for (let startMs of patternStartTimes) {
                // Ensure the generated instance is indeed for the current day being rendered.
                results.push(new FilteredReminderInstance(
                    entityId,
                    entityName,
                    startMs,
                    originalDate, // Pattern's initial date
                    originalTime, // Pattern's time
                    // false, // isAllDay - removed
                    reminderPatternIndex
                ));
            }
        }
        return results;
    }
};


function renderDay(day, element, index) {
    ASSERT(type(day, DateField) && type(index, Int));
    // get existing element
    
    ASSERT(exists(element));
    ASSERT(parseFloat(HTML.getStyle(element, 'width').slice(0, -2)).toFixed(2) == columnWidth.toFixed(2), `renderDay element width (${parseFloat(HTML.getStyle(element, 'width').slice(0, -2)).toFixed(2)}) is not ${columnWidth.toFixed(2)}`);
    ASSERT(type(columnWidth, Number));
    ASSERT(HTML.getStyle(element, 'height').slice(HTML.getStyle(element, 'height').length-2, HTML.getStyle(element, 'height').length) == 'px', `element height last 2 chars aren't 'px': ${HTML.getStyle(element, 'height').slice(HTML.getStyle(element, 'height').length-2, HTML.getStyle(element, 'height').length)}`);
    ASSERT(type(parseFloat(HTML.getStyle(element, 'height').slice(0, -2)), Number));

    // look for hour markers
    if (HTML.getUnsafely(`day${index}hourMarker1`) == null) { // create hour markers
        // if one is missing, all 24 must be missing
        for (let j = 0; j < 24; j++) {
            ASSERT(type(parseInt(HTML.getStyle(element, 'top').slice(0, -2), 10), Int));
            let dayElementVerticalPos = parseInt(HTML.getStyle(element, 'top').slice(0, -2), 10);
            ASSERT(HTML.getStyle(element, 'left').slice(HTML.getStyle(element, 'left').length-2, HTML.getStyle(element, 'left').length) == 'px', `element style 'left' last 2 chars aren't 'px': ${HTML.getStyle(element, 'left').slice(HTML.getStyle(element, 'left').length-2, HTML.getStyle(element, 'left').length)}`);
            ASSERT(type(parseInt(HTML.getStyle(element, 'left').slice(0, -2), 10), Int));
            let dayElementHorizontalPos = parseInt(HTML.getStyle(element, 'left').slice(0, -2), 10);

            ASSERT(HTML.getStyle(element, 'height').slice(HTML.getStyle(element, 'height').length-2, HTML.getStyle(element, 'height').length) == 'px', `element height last 2 chars aren't 'px': ${HTML.getStyle(element, 'height').slice(HTML.getStyle(element, 'height').length-2, HTML.getStyle(element, 'height').length)}`);
            ASSERT(type(parseFloat(HTML.getStyle(element, 'height').slice(0, -2)), Number));
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
                    backgroundColor: 'var(--shade-3)',
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
                color: 'var(--shade-3)',
                fontFamily: 'JetBrains Mono',
                fontSize: fontSize,
                zIndex: '401'
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
    // reminders also go on the calendar
    // get unix start and end of day with user's offsets
    // Create DateTime from DateField
    let dayTime = DateTime.local(day.year, day.month, day.day);
    let startOfDay = dayTime.startOf('day').plus({hours: user.settings.startOfDayOffset});
    startOfDay = startOfDay.toMillis(); // unix
    let endOfDay = dayTime.endOf('day').plus({hours: user.settings.endOfDayOffset});
    endOfDay = endOfDay.toMillis() + 1; // +1 to include the end of the day

    let G_filteredSegmentOfDayInstances = [];
    let G_filteredAllDayInstances = [];
    let G_filteredReminderInstances = [];

    for (let entityIndex = 0; entityIndex < user.entityArray.length; entityIndex++) {
        const entity = user.entityArray[entityIndex];
        ASSERT(type(entity, Entity));

        if (type(entity.data, TaskData)) {
            if (entity.data.workSessions > 0) {
                for (let patternIndex = 0; patternIndex < entity.data.workSessions.length; patternIndex++) {
                    const workSession = entity.data.workSessions[patternIndex];
                    const factoryResults = FilteredInstancesFactory.fromTaskWorkSession(entity, workSession, patternIndex, day, startOfDay, endOfDay);
                    factoryResults.forEach(res => {
                        if (type(res, FilteredAllDayInstance)) {
                            G_filteredAllDayInstances.push(res);
                        } else if (type(res, FilteredSegmentOfDayInstance)) {
                            G_filteredSegmentOfDayInstances.push(res);
                        } else {
                            ASSERT(res === NULL, "Factory method returned unexpected type or non-NULL invalid value");
                        }
                    });
                }
            }
        } else if (type(entity.data, EventData)) {
            for (let patternIndex = 0; patternIndex < entity.data.instances.length; patternIndex++) {
                const eventInst = entity.data.instances[patternIndex];
                const factoryResults = FilteredInstancesFactory.fromEvent(entity, eventInst, patternIndex, day, startOfDay, endOfDay);
                factoryResults.forEach(res => {
                    if (type(res, FilteredAllDayInstance)) {
                        G_filteredAllDayInstances.push(res);
                    } else if (type(res, FilteredSegmentOfDayInstance)) {
                        G_filteredSegmentOfDayInstances.push(res);
                    } else {
                        ASSERT(res === NULL, "Factory method returned unexpected type or non-NULL invalid value");
                    }
                });
            }
        } else if (type(entity.data, ReminderData)) {
            for (let patternIndex = 0; patternIndex < entity.data.instances.length; patternIndex++) {
                const reminderInst = entity.data.instances[patternIndex];
                const factoryResults = FilteredInstancesFactory.fromReminder(entity, reminderInst, patternIndex, day, startOfDay, endOfDay);
                factoryResults.forEach(res => {
                    // Ensure that the factory for reminders now ONLY returns FilteredReminderInstance
                    ASSERT(type(res, FilteredReminderInstance), "FilteredInstancesFactory.fromReminder should only return FilteredReminderInstance objects.");
                    if (type(res, FilteredReminderInstance)) {
                        G_filteredReminderInstances.push(res);
                    } else {
                        // This case should ideally not be hit if the factory is correct
                        ASSERT(false, "Warning: Unexpected instance type from fromReminder factory: " + String(res));
                    }
                });
            }
        } else {
            ASSERT(false, "Unknown entity data type in renderDay");
        }
    }

    // Log filtered instances
    log("Filtered Segment of Day Instances for day " + day.year + "-" + day.month + "-" + day.day + ":");
    log(G_filteredSegmentOfDayInstances);
    log("Filtered All-Day Instances for day " + day.year + "-" + day.month + "-" + day.day + ":");
    log(G_filteredAllDayInstances);
    log("Filtered Reminder Instances for day " + day.year + "-" + day.month + "-" + day.day + ":");
    log(G_filteredReminderInstances);

    // adjust day element height and vertical pos to fit all day events at the top (below text but above hour markers)
    const allDayEventHeight = 18; // height in px for each all-day event
    const totalAllDayEventsHeight = G_filteredAllDayInstances.length * allDayEventHeight + 2; // 2px margin
    
    // Get the original dimensions that were set by renderCalendar(), not the current modified ones
    // We need to recalculate the original dimensions based on the window size and layout
    let originalHeight = window.innerHeight - (2 * windowBorderMargin) - headerSpace - topOfCalendarDay;
    let originalTop = windowBorderMargin + headerSpace + topOfCalendarDay;
    let dayElementLeft = parseInt(HTML.getStyle(element, 'left').slice(0, -2));
    
    // Apply stacking adjustments if needed
    if (user.settings.stacking) {
        originalHeight = (window.innerHeight - headerSpace - (2 * windowBorderMargin) - gapBetweenColumns)/2 - topOfCalendarDay;
        originalHeight -= 1; // manual adjustment
        if (index >= Math.floor(user.settings.numberOfCalendarDays / 2)) { // bottom half
            originalTop += originalHeight + gapBetweenColumns + topOfCalendarDay;
        }
    }
    
    // Calculate new top and height for the main timed event area within the day element
    let timedEventAreaHeight = originalHeight - totalAllDayEventsHeight;
    let timedEventAreaTop = originalTop + totalAllDayEventsHeight;
    
    // Update the main day element's style to reflect the space made for all-day events
    HTML.setStyle(element, {
        height: String(timedEventAreaHeight) + 'px',
        top: String(timedEventAreaTop) + 'px'
    });
    
    // Now update all the hour markers and hour marker text based on the new timedEventArea dimensions
    for (let j = 0; j < 24; j++) {
        let hourPosition = timedEventAreaTop + (j * timedEventAreaHeight / 24);
        
        if (j > 0) { 
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
    
    renderAllDayInstances(G_filteredAllDayInstances, index, columnWidth, originalTop, dayElementLeft);
    renderSegmentOfDayInstances(G_filteredSegmentOfDayInstances, index, columnWidth, timedEventAreaTop, timedEventAreaHeight, dayElementLeft);
    renderReminderInstances(G_filteredReminderInstances, index, columnWidth, timedEventAreaTop, timedEventAreaHeight, dayElementLeft, startOfDay, endOfDay);
}

// Renders all-day instances for a given day column.
// If there are fewer all-day events than previously rendered for this day column, 
// the extra DOM elements are removed. For the remaining (or newly created) elements, 
// their content/style is updated to reflect the current all-day instances.
function renderAllDayInstances(allDayInstances, dayIndex, colWidth, dayElementActualTop, dayElemLeft) {
    ASSERT(type(allDayInstances, List(FilteredAllDayInstance)));
    ASSERT(type(dayIndex, Int));
    ASSERT(type(colWidth, Number));
    ASSERT(type(dayElementActualTop, Number)); // This is the original top of the day column, before shrinking for all-day items
    ASSERT(type(dayElemLeft, Int));

    const allDayEventHeight = 18; // height in px for each all-day event

    for (let i = 0; i < allDayInstances.length; i++) {
        let allDayEventData = allDayInstances[i];
        // All-day events are positioned from the dayElementActualTop (original top of the day column)
        let allDayEventTopPosition = dayElementActualTop + (i * allDayEventHeight);
        
        let allDayEventElement = HTML.getUnsafely(`day${dayIndex}allDayEvent${i}`);
        if (!exists(allDayEventElement)) {
            allDayEventElement = HTML.make('div');
            HTML.setId(allDayEventElement, `day${dayIndex}allDayEvent${i}`);
            HTML.body.appendChild(allDayEventElement);
        }
        
        HTML.setStyle(allDayEventElement, {
            position: 'fixed',
            width: String(colWidth - 6.5) + 'px',
            height: String(allDayEventHeight - 2) + 'px',
            top: String(allDayEventTopPosition) + 'px',
            left: String(dayElemLeft + 4.5) + 'px',
            backgroundColor: 'var(--shade-2)',
            opacity: String(allDayEventData.ignore ? 0.5 : 1),
            borderRadius: '3px',
            zIndex: '350',
            // TODO: Add text for allDayEventData.name (ellipsized)
        });
        HTML.setHoverStyle(allDayEventElement, {
            opacity: '1' // Ensure opacity is a string for CSS
        });
    }

    let existingAllDayEventIndex = allDayInstances.length;
    let extraAllDayEventElement = HTML.getUnsafely(`day${dayIndex}allDayEvent${existingAllDayEventIndex}`);
    while (exists(extraAllDayEventElement)) {
        extraAllDayEventElement.remove();
        existingAllDayEventIndex++;
        extraAllDayEventElement = HTML.getUnsafely(`day${dayIndex}allDayEvent${existingAllDayEventIndex}`);
    }
}

function renderSegmentOfDayInstances(segmentInstances, dayIndex, colWidth, timedAreaTop, timedAreaHeight, dayElemLeft) {
    ASSERT(type(segmentInstances, List(FilteredSegmentOfDayInstance)));
    ASSERT(type(dayIndex, Int));
    ASSERT(type(colWidth, Number));
    ASSERT(type(timedAreaTop, Number));
    ASSERT(type(timedAreaHeight, Number));
    ASSERT(type(dayElemLeft, Int));

    // TODO: Implement rendering logic for FilteredSegmentOfDayInstance objects.
    // This will involve:
    // - Iterating through segmentInstances.
    // - For each instance, calculating its vertical position and height within the timedArea.
    //   - top = timedAreaTop + ( (instance.startDateTime - dayStartUnix) / (dayEndUnix - dayStartUnix) ) * timedAreaHeight
    //   - height = ( (instance.endDateTime - instance.startDateTime) / (dayEndUnix - dayStartUnix) ) * timedAreaHeight
    //   (Need dayStartUnix and dayEndUnix for the specific day, or pass percentages)
    // - Creating/updating DOM elements for each instance.
    // - Styling them (background color based on instanceKind, text for name, etc.).
    // - Handling wrapToPreviousDay and wrapToNextDay (e.g., different border radius, arrows).
    // - Removing stale DOM elements if the number of instances changes.
}

// A map to keep track of running animation frames for each reminder group
const G_animationFrameMap = new Map();

function updateStackPositions(dayIndex, groupIndex, isHovering) {
    ASSERT(type(dayIndex, Int) && type(groupIndex, Int) && type(isHovering, Boolean));

    const animationKey = `${dayIndex}-${groupIndex}`;

    // Cancel any previous animation frame for this group to avoid conflicts
    if (G_animationFrameMap.has(animationKey)) {
        cancelAnimationFrame(G_animationFrameMap.get(animationKey));
        G_animationFrameMap.delete(animationKey);
    }
    
    const primaryTextElement = HTML.getUnsafely(`day${dayIndex}reminderText${groupIndex}`);
    if (!exists(primaryTextElement)) {
        // Elements might have been removed by a re-render, so we stop.
        return; 
    }
    
    // Assert that this is part of a stack.
    const firstStackElement = HTML.getUnsafely(`day${dayIndex}reminderStackText${groupIndex}_1`);
    ASSERT(exists(firstStackElement), `updateStackPositions called for a non-stacked reminder: day${dayIndex}, group${groupIndex}`);

    const reminderTopPosition = parseFloat(primaryTextElement.style.top);
    const reminderTextHeight = 14; // From renderReminderInstances

    let groupLength = 1;
    while (HTML.getUnsafely(`day${dayIndex}reminderStackText${groupIndex}_${groupLength}`)) {
        groupLength++;
    }

    function animationLoop() {
        let anyChanges = false;
        
        for (let stackIndex = 1; stackIndex < groupLength; stackIndex++) {
            let stackedText = HTML.getUnsafely(`day${dayIndex}reminderStackText${groupIndex}_${stackIndex}`);
            let stackedCount = HTML.getUnsafely(`day${dayIndex}reminderStackCount${groupIndex}_${stackIndex}`);
            
            if (exists(stackedText) && exists(stackedCount)) {
                const expandedTop = reminderTopPosition + (reminderTextHeight * stackIndex);
                const expandedCountTop = expandedTop + 1.5;
                const hiddenTop = reminderTopPosition;
                const hiddenCountTop = reminderTopPosition + 1.5;
                
                const currentTop = parseFloat(stackedText.style.top);
                const currentCountTop = parseFloat(stackedCount.style.top);
                const currentOpacity = parseFloat(stackedText.style.opacity);
                
                const targetTop = isHovering ? expandedTop : hiddenTop;
                const targetCountTop = isHovering ? expandedCountTop : hiddenCountTop;
                const targetOpacity = isHovering ? 1 : 0;

                const speed = 0.2;
                const threshold = 0.1;

                let newTop = currentTop + (targetTop - currentTop) * speed;
                let newCountTop = currentCountTop + (targetCountTop - currentCountTop) * speed;
                let newOpacity = currentOpacity + (targetOpacity - currentOpacity) * speed;

                if (Math.abs(targetTop - newTop) < threshold) newTop = targetTop;
                if (Math.abs(targetCountTop - newCountTop) < threshold) newCountTop = targetCountTop;
                if (Math.abs(targetOpacity - newOpacity) < threshold) newOpacity = targetOpacity;

                if (newTop !== currentTop || newCountTop !== currentCountTop || newOpacity !== currentOpacity) {
                    anyChanges = true;
                }

                stackedText.style.top = `${newTop}px`;
                stackedText.style.opacity = newOpacity;
                stackedCount.style.top = `${newCountTop}px`;
                stackedCount.style.opacity = newOpacity;
            }
        }
        
        if (anyChanges) {
            const frameId = requestAnimationFrame(animationLoop);
            G_animationFrameMap.set(animationKey, frameId);
        } else {
            G_animationFrameMap.delete(animationKey);
        }
    }
    
    animationLoop();
}

function handleReminderDragMove(e) {
    if (!G_reminderDragState.isDragging) return;
    
    e.preventDefault();

    const dy = e.clientY - G_reminderDragState.initialY;
    
    // Calculate bounds for the drag
    const { timedAreaTop, timedAreaHeight, dayIndex, groupIndex } = G_reminderDragState;
    const reminderLineHeight = 2;
    const reminderTextHeight = 14;
    const quarterCircleRadius = 10;
    const minTop = timedAreaTop;
    const maxTop = timedAreaTop + timedAreaHeight - reminderLineHeight; // Allow line to go to the very bottom

    // The new top position for the reminder LINE
    const newLineTop = G_reminderDragState.initialTops[0] + dy;
    const clampedLineTop = Math.max(minTop, Math.min(newLineTop, maxTop));
    
    // Determine if the reminder should be in a "flipped" state
    const flipThresholdProportion = (23 * 60 + 40) / (24 * 60); // approx 11:40 PM
    const flipThresholdTop = timedAreaTop + (timedAreaHeight * flipThresholdProportion);
    const isFlipped = clampedLineTop > flipThresholdTop;

    // Animate all elements in the group based on the new line position and flip state
    G_reminderDragState.groupElements.forEach((el, i) => {
        // We only need to calculate the main line's position once.
        // Other elements will be positioned relative to it.
        if (el.id.includes('Line') || el.id.includes('line')) {
            el.style.top = `${clampedLineTop}px`;
        
        } else if (el.id.includes('Text') || el.id.includes('text')) {
            if (isFlipped) {
                // Position text above the line
                el.style.top = `${clampedLineTop - reminderTextHeight + 2}px`;
                el.style.height = `${reminderTextHeight}px`;
                el.style.paddingTop = '1px';
                // Flip border radius for the new orientation
                el.style.borderTopLeftRadius = '6px';
                el.style.borderBottomLeftRadius = '6px';
                el.style.borderTopRightRadius = '6px'; 
                el.style.borderBottomRightRadius = '0px'; 
            } else {
                // Original position below the line
                el.style.top = `${clampedLineTop}px`;
                el.style.height = `${reminderLineHeight + reminderTextHeight - 2}px`;
                el.style.paddingTop = `${reminderLineHeight - 1}px`;
                // Original border radius
                el.style.borderTopLeftRadius = '6px';
                el.style.borderBottomLeftRadius = '6px';
                el.style.borderTopRightRadius = '0px';
                el.style.borderBottomRightRadius = '6px';
            }
        
        } else if (el.id.includes('QuarterCircle') || el.id.includes('quarter-circle')) {
            if (isFlipped) {
                // Position quarter circle above the line, flipped vertically
                el.style.top = `${clampedLineTop - quarterCircleRadius}px`;
                const gradientMask = `radial-gradient(circle at top right, transparent 0, transparent ${quarterCircleRadius}px, black ${quarterCircleRadius + 1}px)`;
                el.style.webkitMaskImage = gradientMask;
                el.style.maskImage = gradientMask;
                el.style.webkitMaskPosition = 'top right';
                el.style.maskPosition = 'top right';
            } else {
                // Original position below the line
                el.style.top = `${clampedLineTop + reminderLineHeight}px`;
                const gradientMask = `radial-gradient(circle at bottom right, transparent 0, transparent ${quarterCircleRadius}px, black ${quarterCircleRadius + 1}px)`;
                el.style.webkitMaskImage = gradientMask;
                el.style.maskImage = gradientMask;
                el.style.webkitMaskPosition = 'bottom right';
                el.style.maskPosition = 'bottom right';
            }

        } else if (el.id.includes('Count') || el.id.includes('count')) {
            if (isFlipped) {
                el.style.top = `${clampedLineTop - reminderTextHeight + 3.5}px`;
            } else {
                el.style.top = `${clampedLineTop + reminderLineHeight - 0.5}px`;
            }
        }
    });

    // Update time bubble position and text
    const timeBubble = HTML.getUnsafely('dragTimeBubble');
    if (exists(timeBubble)) {
        // Calculate the time based on current position
        const proportionOfDay = (clampedLineTop - timedAreaTop) / timedAreaHeight;
        const totalDayDurationMs = G_reminderDragState.dayEndUnix - G_reminderDragState.dayStartUnix;
        const newTimeOffsetMs = proportionOfDay * totalDayDurationMs;
        const newTimestamp = G_reminderDragState.dayStartUnix + newTimeOffsetMs;
        const newDateTime = DateTime.fromMillis(newTimestamp);
        
        // Snap to 5-minute intervals for display
        const snappedMinute = Math.round(newDateTime.minute / 5) * 5;
        const displayDateTime = newDateTime.set({ minute: snappedMinute, second: 0, millisecond: 0 });
        
        // Format time according to user preference (no AM/PM)
        let timeText;
        if (user.settings.ampmOr24 === '24') {
            timeText = displayDateTime.toFormat('HH:mm');
        } else {
            timeText = displayDateTime.toFormat('h:mm');
        }
        
        timeBubble.innerHTML = timeText;
        
        // Position bubble flush with left edge of calendar day
        const dayElement = HTML.get('day' + G_reminderDragState.dayIndex);
        const dayLeft = parseInt(dayElement.style.left);
        
        HTML.setStyle(timeBubble, {
            top: String(clampedLineTop) + 'px',
            left: String(dayLeft + 1) + 'px'
        });
    }

    // Update all recurring reminders in the stack on other days in real-time
    const recurringReminders = [];
    G_reminderDragState.reminderGroup.forEach(reminder => {
        const entity = user.entityArray.find(e => e.id === reminder.id);
        if (entity) {
            const reminderInstance = entity.data.instances[reminder.patternIndex];
            if (type(reminderInstance, RecurringReminderInstance)) {
                recurringReminders.push({
                    id: reminder.id,
                    patternIndex: reminder.patternIndex
                });
            }
        }
    });

    if (recurringReminders.length > 0) {
        // Calculate the new time based on the current drag position (using clamped position)
        const finalTop = Math.max(minTop, Math.min(G_reminderDragState.initialTops[0] + dy, maxTop));
        const clampedTop = Math.max(timedAreaTop, Math.min(finalTop, timedAreaTop + timedAreaHeight - reminderLineHeight));
        const proportionOfDay = (clampedTop - timedAreaTop) / timedAreaHeight;
        const totalDayDurationMs = G_reminderDragState.dayEndUnix - G_reminderDragState.dayStartUnix;
        
        if (totalDayDurationMs > 0) {
            const newTimeOffsetMs = proportionOfDay * totalDayDurationMs;
            const newTimestamp = G_reminderDragState.dayStartUnix + newTimeOffsetMs;
            const newDateTime = DateTime.fromMillis(newTimestamp);
            
            // Snap to 5-minute intervals for the time update
            const snappedMinute = Math.round(newDateTime.minute / 5) * 5;
            const finalDateTime = newDateTime.set({ minute: snappedMinute, second: 0, millisecond: 0 });
            
            // Temporarily update the recurring reminder instances' times for re-rendering
            const originalTimes = [];
            recurringReminders.forEach(recurringReminder => {
                const entity = user.entityArray.find(e => e.id === recurringReminder.id);
                if (entity) {
                    const reminderInstance = entity.data.instances[recurringReminder.patternIndex];
                    if (type(reminderInstance, RecurringReminderInstance)) {
                        // Store original time
                        originalTimes.push({
                            id: recurringReminder.id,
                            patternIndex: recurringReminder.patternIndex,
                            originalTime: reminderInstance.time
                        });
                        // Temporarily set new time
                        reminderInstance.time = new TimeField(finalDateTime.hour, finalDateTime.minute);
                    }
                }
            });
            
            // Re-render all affected days (except the current drag day) to update stacking
            const allDays = currentDays();
            for (let dayIdx = 0; dayIdx < allDays.length; dayIdx++) {
                if (dayIdx === G_reminderDragState.dayIndex) continue; // Skip the day being dragged
                
                const dayToRender = allDays[dayIdx];
                const dayElementToRender = HTML.get('day' + dayIdx);
                renderDay(dayToRender, dayElementToRender, dayIdx);
            }
            
            // Restore original times (we only want the temporary change for rendering)
            originalTimes.forEach(originalTime => {
                const entity = user.entityArray.find(e => e.id === originalTime.id);
                if (entity) {
                    const reminderInstance = entity.data.instances[originalTime.patternIndex];
                    if (type(reminderInstance, RecurringReminderInstance)) {
                        reminderInstance.time = originalTime.originalTime;
                    }
                }
            });
        }
    }
}

function handleReminderDragEnd(e) {
    if (!G_reminderDragState.isDragging) return;
    
    e.preventDefault();

    // Remove listeners
    document.removeEventListener('mousemove', handleReminderDragMove);
    document.removeEventListener('mouseup', handleReminderDragEnd);

    // Remove time bubble
    const timeBubble = HTML.getUnsafely('dragTimeBubble');
    if (exists(timeBubble)) {
        timeBubble.remove();
    }

    // NEW: cleanup for clones
    if (G_reminderDragState.isClone) {
        G_reminderDragState.groupElements.forEach(el => el.remove());
        
        // Restore visibility of original elements and count
        const { mainCount, stackedText, stackedCount } = G_reminderDragState.originalStackElements;
        if (exists(mainCount)) {
            if (mainCount.dataset.originalCount) {
                mainCount.innerHTML = mainCount.dataset.originalCount;
                delete mainCount.dataset.originalCount;
            }
            mainCount.style.visibility = 'visible';
        }
        if (exists(stackedText)) stackedText.style.visibility = 'visible';
        if (exists(stackedCount)) stackedCount.style.visibility = 'visible';
    }


    // Restore z-index
    G_reminderDragState.groupElements.forEach(el => {
        if (el.dataset.originalZIndexForDrag) {
            el.style.zIndex = el.dataset.originalZIndexForDrag;
            delete el.dataset.originalZIndexForDrag;
        }
    });

    const dy = e.clientY - G_reminderDragState.initialY;
    const finalTop = G_reminderDragState.initialTops[0] + dy;

    const { timedAreaTop, timedAreaHeight, dayStartUnix, dayEndUnix, dayIndex, reminderGroup } = G_reminderDragState;

    const reminderLineHeight = 2;
    const reminderTextHeight = 14;

    const clampedTop = Math.max(timedAreaTop, Math.min(finalTop, timedAreaTop + timedAreaHeight - reminderLineHeight));

    const proportionOfDay = (clampedTop - timedAreaTop) / timedAreaHeight;
    const totalDayDurationMs = dayEndUnix - dayStartUnix;

    if (totalDayDurationMs <= 0) {
        log("Error: totalDayDurationMs is zero or negative");
        G_reminderDragState.isDragging = false;
        return;
    }
    
    const newTimeOffsetMs = proportionOfDay * totalDayDurationMs;
    const newTimestamp = dayStartUnix + newTimeOffsetMs;

    const newDateTime = DateTime.fromMillis(newTimestamp);
    
    const snappedMinute = Math.round(newDateTime.minute / 5) * 5;
    const finalDateTime = newDateTime.set({ minute: snappedMinute, second: 0, millisecond: 0 });

    log("Drag end debug:");
    log("finalTop:", finalTop);
    log("clampedTop:", clampedTop);
    log("proportionOfDay:", proportionOfDay);
    log("newTimestamp:", newTimestamp);
    log("finalDateTime:", finalDateTime.toISO());
    log("reminderGroup length:", reminderGroup.length);

    reminderGroup.forEach((reminder, index) => {
        log(`Processing reminder ${index}:`, reminder.id);
        const entity = user.entityArray.find(e => e.id === reminder.id);
        if (entity) {
            log("Found entity:", entity.name);
            const reminderInstance = entity.data.instances[reminder.patternIndex];
            log("Reminder instance type:", reminderInstance.constructor.name);
            
            if (type(reminderInstance, NonRecurringReminderInstance)) {
                log("Old time:", reminderInstance.time.hour, reminderInstance.time.minute);
                log("Old date:", reminderInstance.date.year, reminderInstance.date.month, reminderInstance.date.day);
                reminderInstance.time = new TimeField(finalDateTime.hour, finalDateTime.minute);
                const currentDayDateField = currentDays()[dayIndex];
                reminderInstance.date = currentDayDateField;
                log("New time:", reminderInstance.time.hour, reminderInstance.time.minute);
                log("New date:", reminderInstance.date.year, reminderInstance.date.month, reminderInstance.date.day);

            } else if (type(reminderInstance, RecurringReminderInstance)) {
                log("Old time:", reminderInstance.time.hour, reminderInstance.time.minute);
                reminderInstance.time = new TimeField(finalDateTime.hour, finalDateTime.minute);
                log("New time:", reminderInstance.time.hour, reminderInstance.time.minute);
            }
        } else {
            log("Entity not found for ID:", reminder.id);
        }
    });

    log("Saving user data...");
    saveUserData(user);
    log("User data saved");

    // Check if any of the dragged reminders were recurring
    let hasRecurringReminder = false;
    reminderGroup.forEach(reminder => {
        const entity = user.entityArray.find(e => e.id === reminder.id);
        if (entity) {
            const reminderInstance = entity.data.instances[reminder.patternIndex];
            if (type(reminderInstance, RecurringReminderInstance)) {
                hasRecurringReminder = true;
            }
        }
    });

    if (hasRecurringReminder) {
        log("Re-rendering all visible days due to recurring reminder change...");
        // Re-render all visible days since recurring reminders affect multiple days
        const allDays = currentDays();
        for (let i = 0; i < allDays.length; i++) {
            const dayToRender = allDays[i];
            const dayElementToRender = HTML.get('day' + i);
            renderDay(dayToRender, dayElementToRender, i);
        }
        log("All days re-rendered");
    } else {
        log("Re-rendering single day...");
        const dayToRender = currentDays()[dayIndex];
        const dayElementToRender = HTML.get('day' + dayIndex);
        renderDay(dayToRender, dayElementToRender, dayIndex);
        log("Day re-rendered");
    }

    G_reminderDragState.isDragging = false;
}

// New function to render reminder instances
function renderReminderInstances(reminderInstances, dayIndex, colWidth, timedAreaTop, timedAreaHeight, dayElemLeft, dayStartUnix, dayEndUnix) {
    ASSERT(type(reminderInstances, List(FilteredReminderInstance)));
    ASSERT(type(dayIndex, Int));
    ASSERT(type(colWidth, Number));
    ASSERT(type(timedAreaTop, Number));
    ASSERT(type(timedAreaHeight, Number));
    ASSERT(type(dayElemLeft, Int));
    ASSERT(type(dayStartUnix, Int));
    ASSERT(type(dayEndUnix, Int));

    const spaceForHourMarkers = 36; // px
    const reminderLineWidthAdjustment = 1; // px

    const reminderLineHeight = 2; // px height of the blue line
    const reminderTextHeight = 14; // px, approximate height for text + small gap
    const reminderTextFontSize = '10px';
    const textPaddingLeft = 2; // px
    const textPaddingRight = 2; // px
    const quarterCircleRadius = 10; // Radius for the decorative quarter circle
    const countIndicatorSize = 11; // px, size of the count indicator circle (reduced from 12px)
    const countIndicatorPadding = 3; // px, space between indicator and text (reduced by 1px)

    // Group reminders by their start time
    const reminderGroups = {};
    for (let reminder of reminderInstances) {
        const timeKey = reminder.dateTime.toString();
        if (!reminderGroups[timeKey]) {
            reminderGroups[timeKey] = [];
        }
        reminderGroups[timeKey].push(reminder);
    }

    function getReminderElementsFromIndex(dayIdx, grpIdx, stackSize) {
        ASSERT(type(dayIdx, Int));
        ASSERT(type(grpIdx, Int));
        ASSERT(type(stackSize, Int));

        const elements = [];
        elements.push(HTML.getUnsafely(`day${dayIdx}reminderLine${grpIdx}`));
        elements.push(HTML.getUnsafely(`day${dayIdx}reminderText${grpIdx}`));
        elements.push(HTML.getUnsafely(`day${dayIdx}reminderQuarterCircle${grpIdx}`));
        if (stackSize > 1) {
            elements.push(HTML.getUnsafely(`day${dayIdx}reminderCount${grpIdx}`));
            for (let i = 1; i < stackSize; i++) {
                elements.push(HTML.getUnsafely(`day${dayIdx}reminderStackText${grpIdx}_${i}`));
                elements.push(HTML.getUnsafely(`day${dayIdx}reminderStackCount${grpIdx}_${i}`));
            }
        }

        return elements;
    };

    let groupIndex = 0;
    let lastReminderBottom = -1; // For tracking overlaps
    let touchingGroupColorIndex = 0; // For alternating colors

    // Sort by time to process sequentially and check for overlaps
    for (let timeKey of Object.keys(reminderGroups).sort()) {
        const group = reminderGroups[timeKey];
        const isGrouped = group.length > 1;
        const primaryReminder = group[0];
        
        let reminderTopPosition;

        // Calculate position based on time
        const totalDayDurationMs = dayEndUnix - dayStartUnix;
        const reminderOffsetMs = primaryReminder.dateTime - dayStartUnix;
        if (totalDayDurationMs <= 0) { // Avoid division by zero or negative
            log("Warning: totalDayDurationMs is zero or negative in renderReminderInstances for day " + dayIndex);
            reminderTopPosition = timedAreaTop; // Default to top
        } else {
            reminderTopPosition = timedAreaTop + (reminderOffsetMs / totalDayDurationMs) * timedAreaHeight;
        }
        
        // Ensure reminder is within the visible timed area bounds, allowing the line to reach the bottom
        const maxTop = timedAreaTop + timedAreaHeight - reminderLineHeight;
        reminderTopPosition = Math.max(timedAreaTop, Math.min(reminderTopPosition, maxTop));
        
        // Check if the reminder should be rendered in a "flipped" state
        const flipThresholdProportion = (23 * 60 + 40) / (24 * 60);
        const flipThresholdTop = timedAreaTop + (timedAreaHeight * flipThresholdProportion);
        const isFlipped = reminderTopPosition > flipThresholdTop;

        // Check for overlap with the previous reminder group to alternate colors
        if (lastReminderBottom !== -1 && reminderTopPosition < lastReminderBottom) {
            touchingGroupColorIndex++;
        } else {
            touchingGroupColorIndex = 0; // Reset because the chain is broken
        }
        const accentColorVarName = `--accent-${touchingGroupColorIndex % user.palette.accent.length}`;
        const accentColorHex = getComputedStyle(document.documentElement).getPropertyValue(accentColorVarName).trim();
        const accentColorVar = `var(${accentColorVarName})`;

        // Calculate container height and update last position
        const containerHeight = reminderLineHeight + reminderTextHeight;
        lastReminderBottom = reminderTopPosition + containerHeight;

        const baseZIndex = 2600;
        // Calculate minutes since start of day for z-index layering
        const reminderDateTime = DateTime.fromMillis(primaryReminder.dateTime);
        const startOfReminderDay = reminderDateTime.startOf('day');
        const minutesSinceStartOfDay = Math.floor((primaryReminder.dateTime - startOfReminderDay.toMillis()) / (1000 * 60));
        const currentGroupZIndex = baseZIndex + minutesSinceStartOfDay; // Z-index based on time of day

        // animations for sliding the stacked reminders up and down
        const currentGroupIndex = groupIndex; // Capture for closures
        let leaveTimeoutId;

        const handleSingleReminderMouseEnter = function() {
            if (G_reminderDragState.isDragging) return;
            clearTimeout(leaveTimeoutId);
            const groupElements = getReminderElementsFromIndex(dayIndex, currentGroupIndex, 1);
            groupElements.forEach(el => {
                if (exists(el)) {
                    if (!el.dataset.originalZIndex) {
                        el.dataset.originalZIndex = el.style.zIndex;
                    }
                    el.style.zIndex = parseInt(el.style.zIndex) + indexIncreaseOnHover;
                }
            });
        };
        const handleSingleReminderMouseLeave = function() {
            if (G_reminderDragState.isDragging) return;
            leaveTimeoutId = setTimeout(() => {
                const groupElements = getReminderElementsFromIndex(dayIndex, currentGroupIndex, 1);
                groupElements.forEach(el => {
                    if (exists(el) && el.dataset.originalZIndex) {
                        el.style.zIndex = el.dataset.originalZIndex;
                        delete el.dataset.originalZIndex;
                    }
                });
            }, 50);
        };

        const handleReminderMouseEnter = function() {
            if (G_reminderDragState.isDragging) return;
            clearTimeout(leaveTimeoutId);
            
            const groupElements = getReminderElementsFromIndex(dayIndex, currentGroupIndex, group.length);
            
            groupElements.forEach(el => {
                if (exists(el)) {
                    if (!el.dataset.originalZIndex) {
                        el.dataset.originalZIndex = el.style.zIndex;
                    }
                    el.style.zIndex = parseInt(el.dataset.originalZIndex) + indexIncreaseOnHover;
                }
            });
            
            updateStackPositions(dayIndex, currentGroupIndex, true);
        };
        const handleReminderMouseLeave = function() {
            if (G_reminderDragState.isDragging) return;
            leaveTimeoutId = setTimeout(() => {
                const groupElements = getReminderElementsFromIndex(dayIndex, currentGroupIndex, group.length);
                groupElements.forEach(el => {
                    if (exists(el) && el.dataset.originalZIndex) {
                        el.style.zIndex = el.dataset.originalZIndex;
                        delete el.dataset.originalZIndex;
                    }
                });
                updateStackPositions(dayIndex, currentGroupIndex, false);
            }, 50);
        };

        const addReminderHoverHandlers = (element) => {
            element.removeEventListener('mouseenter', element.mouseEnterHandler);
            element.removeEventListener('mouseleave', element.mouseLeaveHandler);
            if (isGrouped) {
                element.mouseEnterHandler = handleReminderMouseEnter;
                element.mouseLeaveHandler = handleReminderMouseLeave;
            } else {
                element.mouseEnterHandler = handleSingleReminderMouseEnter;
                element.mouseLeaveHandler = handleSingleReminderMouseLeave;
            }
            element.addEventListener('mouseenter', element.mouseEnterHandler);
            element.addEventListener('mouseleave', element.mouseLeaveHandler);
        };

        // First, measure text width to calculate positions
        // Calculate text positioning with potential count indicator
        const extraPaddingForIndicator = isGrouped ? (countIndicatorSize + countIndicatorPadding) : 2; // +2px for single reminders
        const adjustedTextPaddingLeft = textPaddingLeft + extraPaddingForIndicator;

        // Measure text width
        const measurer = HTML.make('span');
        HTML.setStyle(measurer, {
            visibility: 'hidden',
            fontFamily: 'Inter',
            fontSize: reminderTextFontSize,
            whiteSpace: 'nowrap',
            display: 'inline-block',
            position: 'absolute'
        });
        measurer.innerHTML = primaryReminder.name;
        HTML.body.appendChild(measurer);
        const contentActualWidth = measurer.offsetWidth;
        HTML.body.removeChild(measurer);

        const finalWidthForTextElement = contentActualWidth + adjustedTextPaddingLeft + textPaddingRight;
        const textElementActualWidth = Math.min(finalWidthForTextElement + 1, colWidth - spaceForHourMarkers - 10);
        const quarterCircleLeft = dayElemLeft + spaceForHourMarkers + textElementActualWidth;

        // Create/Update Line Element (now directly on body) - positioned from quarter circle to right edge
        let lineElement = HTML.getUnsafely(`day${dayIndex}reminderLine${groupIndex}`);
        if (!exists(lineElement)) {
            lineElement = HTML.make('div');
            HTML.setId(lineElement, `day${dayIndex}reminderLine${groupIndex}`);
            HTML.body.appendChild(lineElement);
        }
        
        // Set data attributes for robust matching during drag operations
        HTML.setData(lineElement, 'sourceId', primaryReminder.id);
        HTML.setData(lineElement, 'patternNumber', primaryReminder.patternIndex);
        
        lineElement.onmousedown = (e) => {
            e.preventDefault();
            if (e.button !== 0) return; // only left click

            G_reminderDragState.isDragging = true;
            const animationKey = `${dayIndex}-${currentGroupIndex}`;
            if (G_animationFrameMap.has(animationKey)) {
                cancelAnimationFrame(G_animationFrameMap.get(animationKey));
                G_animationFrameMap.delete(animationKey);
            }

            const groupElements = getReminderElementsFromIndex(dayIndex, currentGroupIndex, group.length).filter(el => exists(el));

            G_reminderDragState = {
                isDragging: true,
                dayIndex: dayIndex,
                groupIndex: currentGroupIndex,
                groupElements: groupElements,
                initialTops: groupElements.map(el => parseFloat(el.style.top)),
                initialY: e.clientY,
                timedAreaTop: timedAreaTop,
                timedAreaHeight: timedAreaHeight,
                dayStartUnix: dayStartUnix,
                dayEndUnix: dayEndUnix,
                reminderGroup: group,
            };

            // Create time indicator bubble
            let timeBubble = HTML.make('div');
            HTML.setId(timeBubble, 'dragTimeBubble');
            const bubbleHeight = reminderLineHeight + reminderTextHeight - 2;
            const dayElement = HTML.get('day' + dayIndex);
            const dayLeft = parseInt(dayElement.style.left);
            
            // Hide initially to prevent flickering
            HTML.setStyle(timeBubble, {
                position: 'fixed',
                height: String(bubbleHeight) + 'px',
                width: '33px',
                backgroundColor: 'var(--shade-2)',
                color: 'var(--shade-4)',
                fontSize: '9.5px', // Bigger font
                fontFamily: 'JetBrains Mono',
                borderTopRightRadius: String(bubbleHeight / 2) + 'px',
                borderBottomRightRadius: String(bubbleHeight / 2) + 'px',
                borderTopLeftRadius: '0px',
                borderBottomLeftRadius: '0px',
                paddingTop: String(reminderLineHeight - 1) + 'px', // Align with reminder text
                boxSizing: 'border-box',
                zIndex: '600', // higher than hour marker but below outline
                whiteSpace: 'nowrap',
                pointerEvents: 'none',
                visibility: 'hidden', // Hide initially
                textAlign: 'center',
                paddingRight: '1.5px'
            });
            
            // Set initial position and content
            const initialTop = reminderTopPosition;
            HTML.setStyle(timeBubble, {
                top: String(initialTop) + 'px',
                left: String(dayLeft) + 'px'
            });
            
            // Calculate initial time
            const initialProportionOfDay = (initialTop - timedAreaTop) / timedAreaHeight;
            const totalDayDurationMs = dayEndUnix - dayStartUnix;
            const initialTimeOffsetMs = initialProportionOfDay * totalDayDurationMs;
            const initialTimestamp = dayStartUnix + initialTimeOffsetMs;
            const initialDateTime = DateTime.fromMillis(initialTimestamp);
            const initialSnappedMinute = Math.round(initialDateTime.minute / 5) * 5;
            const initialDisplayDateTime = initialDateTime.set({ minute: initialSnappedMinute, second: 0, millisecond: 0 });
            
            // Format time according to user preference (no AM/PM)
            let initialTimeText;
            if (user.settings.ampmOr24 === '24') {
                initialTimeText = initialDisplayDateTime.toFormat('HH:mm');
            } else {
                initialTimeText = initialDisplayDateTime.toFormat('h:mm');
            }
            timeBubble.innerHTML = initialTimeText;
            
            // Append to body
            HTML.body.appendChild(timeBubble);
            
            // Show after everything is set up
            HTML.setStyle(timeBubble, { visibility: 'visible' });

            document.addEventListener('mousemove', handleReminderDragMove);
            document.addEventListener('mouseup', handleReminderDragEnd);

            // Increase z-index while dragging
            groupElements.forEach(el => {
                if (!el.dataset.originalZIndexForDrag) {
                    el.dataset.originalZIndexForDrag = el.style.zIndex;
                }
                ASSERT(type(el.style.zIndex, String));
                el.style.zIndex = parseInt(el.style.zIndex) + indexIncreaseOnHover;
            });
        };
        const lineWidth = (dayElemLeft + colWidth) - quarterCircleLeft + 2; // the line has to extend a little more, and then the outline goes on top of it (it doesn't extend past outer edge of the outline)
        HTML.setStyle(lineElement, {
            position: 'fixed',
            width: String(lineWidth) + 'px',
            height: String(reminderLineHeight) + 'px',
            top: String(reminderTopPosition) + 'px',
            left: String(quarterCircleLeft) + 'px',
            backgroundColor: accentColorVar,
            zIndex: String(currentGroupZIndex),
            cursor: 'ns-resize'
        });

        // Create/Update Text Element (now directly on body)
        let textElement = HTML.getUnsafely(`day${dayIndex}reminderText${groupIndex}`);
        if (!exists(textElement)) {
            textElement = HTML.make('div');
            HTML.setId(textElement, `day${dayIndex}reminderText${groupIndex}`);
            HTML.body.appendChild(textElement);
        }
        
        // Set data attributes for robust matching during drag operations
        HTML.setData(textElement, 'sourceId', primaryReminder.id);
        HTML.setData(textElement, 'patternNumber', primaryReminder.patternIndex);
        
        addReminderHoverHandlers(textElement);
        textElement.innerHTML = primaryReminder.name;

        HTML.setStyle(textElement, {
            position: 'fixed',
            top: String(isFlipped ? reminderTopPosition - reminderTextHeight + 2 : reminderTopPosition) + 'px',
            left: String(dayElemLeft + spaceForHourMarkers) + 'px',
            backgroundColor: accentColorVar,
            height: String(isFlipped ? reminderTextHeight : (reminderLineHeight + reminderTextHeight - 2)) + 'px',
            paddingTop: String(isFlipped ? '1px' : (reminderLineHeight - 1)) + 'px',
            paddingLeft: String(adjustedTextPaddingLeft) + 'px',
            paddingRight: String(textPaddingRight) + 'px',
            boxSizing: 'border-box',
            color: 'var(--shade-4)',
            fontSize: reminderTextFontSize,
            fontFamily: 'Inter',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            width: String(textElementActualWidth) + 'px',
            zIndex: String(currentGroupZIndex), // Top reminder in stack gets highest z-index
            borderTopLeftRadius: '6px',
            borderBottomLeftRadius: '6px',
            borderTopRightRadius: isFlipped ? '6px' : '0px',
            borderBottomRightRadius: isFlipped ? '0px' : '6px',
            cursor: 'pointer'
        });

        // Create count indicator if grouped (now directly on body)
        if (isGrouped) {
            let countElement = HTML.getUnsafely(`day${dayIndex}reminderCount${groupIndex}`);
            if (!exists(countElement)) {
                countElement = HTML.make('div');
                HTML.setId(countElement, `day${dayIndex}reminderCount${groupIndex}`);
                HTML.body.appendChild(countElement);
            }
            // Remove old listeners
            countElement.removeEventListener('mouseenter', countElement.mouseEnterHandler);
            countElement.removeEventListener('mouseleave', countElement.mouseLeaveHandler);
            
            countElement.mouseEnterHandler = handleReminderMouseEnter;
            countElement.mouseLeaveHandler = handleReminderMouseLeave;
            countElement.addEventListener('mouseenter', countElement.mouseEnterHandler);
            countElement.addEventListener('mouseleave', countElement.mouseLeaveHandler);
            countElement.innerHTML = String(group.length);
            
            HTML.setStyle(countElement, {
                position: 'fixed',
                top: String(isFlipped ? (reminderTopPosition - reminderTextHeight + 3.5) : (reminderTopPosition + reminderLineHeight - 0.5)) + 'px',
                left: String(dayElemLeft + spaceForHourMarkers + textPaddingLeft) + 'px',
                width: String(countIndicatorSize) + 'px',
                height: String(countIndicatorSize) + 'px',
                backgroundColor: 'var(--shade-4)', // White background
                color: accentColorVar, // Original blue color for the number
                fontSize: '8px',
                fontFamily: 'Inter',
                fontWeight: 'bold',
                textAlign: 'center',
                lineHeight: String(countIndicatorSize) + 'px',
                borderRadius: '50%',
                zIndex: String(currentGroupZIndex),
                cursor: 'pointer'
            });
        } else {
            // Remove count indicator if it exists but shouldn't
            let countElement = HTML.getUnsafely(`day${dayIndex}reminderCount${groupIndex}`);
            if (exists(countElement)) {
                countElement.remove();
            }
        }

        // Create/Update Quarter Circle Decorative Element (now directly on body)
        let quarterCircleElement = HTML.getUnsafely(`day${dayIndex}reminderQuarterCircle${groupIndex}`);
        if (!exists(quarterCircleElement)) {
            quarterCircleElement = HTML.make('div');
            HTML.setId(quarterCircleElement, `day${dayIndex}reminderQuarterCircle${groupIndex}`);
            HTML.body.appendChild(quarterCircleElement);
        }

        // Set data attributes for robust matching during drag operations
        HTML.setData(quarterCircleElement, 'sourceId', primaryReminder.id);
        HTML.setData(quarterCircleElement, 'patternNumber', primaryReminder.patternIndex);

        const gradientMask = isFlipped 
            ? `radial-gradient(circle at top right, transparent 0, transparent ${quarterCircleRadius}px, black ${quarterCircleRadius + 1}px)`
            : `radial-gradient(circle at bottom right, transparent 0, transparent ${quarterCircleRadius}px, black ${quarterCircleRadius + 1}px)`;
        const maskSizeValue = `${quarterCircleRadius * 2}px ${quarterCircleRadius * 2}px`;

        HTML.setStyle(quarterCircleElement, {
            position: 'fixed',
            width: String(quarterCircleRadius) + 'px',
            height: String(quarterCircleRadius) + 'px',
            top: String(isFlipped ? (reminderTopPosition - quarterCircleRadius) : (reminderTopPosition + reminderLineHeight)) + 'px',
            left: String(quarterCircleLeft) + 'px',
            backgroundColor: accentColorVar,
            zIndex: String(currentGroupZIndex),
            webkitMaskImage: gradientMask,
            maskImage: gradientMask,
            webkitMaskSize: maskSizeValue,
            maskSize: maskSizeValue,
            webkitMaskPosition: isFlipped ? 'top right' : 'bottom right',
            maskPosition: isFlipped ? 'top right' : 'bottom right',
            webkitMaskRepeat: 'no-repeat',
            maskRepeat: 'no-repeat',
        });

        // Create stacked reminders for groups (initially hidden, positioned relative to container)
        if (isGrouped) {
            for (let stackIndex = 1; stackIndex < group.length; stackIndex++) {
                const stackedReminder = group[stackIndex];
                const stackNumber = group.length - stackIndex; // Count down from top to bottom
                
                // Calculate darkened color (less blue, more black)
                const darknessFactor = stackIndex * 0.25; // Each level gets 25% more black mixed in
                const originalR = parseInt(accentColorHex.slice(1, 3), 16);
                const originalG = parseInt(accentColorHex.slice(3, 5), 16);
                const originalB = parseInt(accentColorHex.slice(5, 7), 16);

                // Interpolate between original color and black, but clamp brightness at 20%
                const brightness = Math.max(0.2, 1 - darknessFactor);
                const newR = Math.round(originalR * brightness);
                const newG = Math.round(originalG * brightness);
                const newB = Math.round(originalB * brightness);

                const darkenedColor = `rgb(${newR}, ${newG}, ${newB})`;

                // Create stacked text element
                let stackedTextElement = HTML.getUnsafely(`day${dayIndex}reminderStackText${currentGroupIndex}_${stackIndex}`);
                if (!exists(stackedTextElement)) {
                    stackedTextElement = HTML.make('div');
                    HTML.setId(stackedTextElement, `day${dayIndex}reminderStackText${currentGroupIndex}_${stackIndex}`);
                    HTML.body.appendChild(stackedTextElement);
                }
                
                // Remove old listeners
                stackedTextElement.removeEventListener('mouseenter', stackedTextElement.mouseEnterHandler);
                stackedTextElement.removeEventListener('mouseleave', stackedTextElement.mouseLeaveHandler);

                stackedTextElement.mouseEnterHandler = handleReminderMouseEnter;
                stackedTextElement.mouseLeaveHandler = handleReminderMouseLeave;
                stackedTextElement.addEventListener('mouseenter', stackedTextElement.mouseEnterHandler);
                stackedTextElement.addEventListener('mouseleave', stackedTextElement.mouseLeaveHandler);
                stackedTextElement.innerHTML = stackedReminder.name;
                
                // Add individual drag handler for this stacked reminder
                stackedTextElement.onmousedown = (e) => {
                    e.preventDefault();
                    e.stopPropagation(); // Prevent the main stack drag from triggering
                    if (e.button !== 0) return; // only left click

                    G_reminderDragState.isDragging = true;
                    const animationKey = `${dayIndex}-${currentGroupIndex}`;
                    if (G_animationFrameMap.has(animationKey)) {
                        cancelAnimationFrame(G_animationFrameMap.get(animationKey));
                        G_animationFrameMap.delete(animationKey);
                    }
                    
                    // --- Start of new logic for dragging stacked item ---

                    // 1. Hide the original stacked element and its count
                    const originalStackedText = HTML.get(`day${dayIndex}reminderStackText${currentGroupIndex}_${stackIndex}`);
                    const originalStackedCount = HTML.getUnsafely(`day${dayIndex}reminderStackCount${currentGroupIndex}_${stackIndex}`);
                    if(exists(originalStackedText)) originalStackedText.style.visibility = 'hidden';
                    if(exists(originalStackedCount)) originalStackedCount.style.visibility = 'hidden';

                    // 2. Update the main stack's count indicator temporarily
                    const mainCountElement = HTML.getUnsafely(`day${dayIndex}reminderCount${currentGroupIndex}`);
                    if(exists(mainCountElement)) {
                        mainCountElement.dataset.originalCount = mainCountElement.innerHTML;
                        const newCount = group.length - 1;
                        if (newCount > 1) {
                            mainCountElement.innerHTML = String(newCount);
                        } else {
                            // If only one item remains in the stack (the primary one), hide the count.
                            mainCountElement.style.visibility = 'hidden';
                        }
                    }

                    // 3. Create new "clone" elements for the dragged reminder
                    const draggedElements = [];
                    // Position the clone at the mouse cursor position (align reminder line with mouse)
                    const mouseY = e.clientY;
                    const reminderTopPosition = mouseY; // Position so the line is at mouse cursor
                    
                    const extraPaddingForIndicator = 2; // for a single reminder
                    const adjustedTextPaddingLeft = textPaddingLeft + extraPaddingForIndicator;
                    
                    // Re-measure text width for the clone
                    const measurer = HTML.make('span');
                    HTML.setStyle(measurer, { visibility: 'hidden', fontFamily: 'Inter', fontSize: reminderTextFontSize, whiteSpace: 'nowrap', position: 'absolute' });
                    measurer.innerHTML = stackedReminder.name;
                    HTML.body.appendChild(measurer);
                    const contentActualWidth = measurer.offsetWidth;
                    HTML.body.removeChild(measurer);

                    const finalWidthForTextElement = contentActualWidth + adjustedTextPaddingLeft + textPaddingRight;
                    const textElementActualWidth = Math.min(finalWidthForTextElement + 1, colWidth - spaceForHourMarkers - 10);
                    const quarterCircleLeft = dayElemLeft + spaceForHourMarkers + textElementActualWidth;

                    // Create clone text
                    const cloneText = HTML.make('div');
                    HTML.setId(cloneText, 'drag-clone-text');
                    cloneText.innerHTML = stackedReminder.name;
                    HTML.setStyle(cloneText, {
                        position: 'fixed', top: String(reminderTopPosition) + 'px', left: String(dayElemLeft + spaceForHourMarkers) + 'px',
                        backgroundColor: accentColorVar, height: String(reminderLineHeight + reminderTextHeight - 2) + 'px',
                        paddingTop: String(reminderLineHeight - 1) + 'px', paddingLeft: String(adjustedTextPaddingLeft) + 'px',
                        paddingRight: String(textPaddingRight) + 'px', boxSizing: 'border-box', color: 'var(--shade-4)',
                        fontSize: reminderTextFontSize, fontFamily: 'Inter', whiteSpace: 'nowrap', overflow: 'hidden',
                        textOverflow: 'ellipsis', width: String(textElementActualWidth) + 'px',
                        zIndex: String(currentGroupZIndex + indexIncreaseOnHover), borderTopLeftRadius: '6px',
                        borderBottomLeftRadius: '6px', borderBottomRightRadius: '6px', borderTopRightRadius: '0px', cursor: 'ns-resize'
                    });
                    HTML.body.appendChild(cloneText);
                    draggedElements.push(cloneText);
                    
                    // Create clone line
                    const cloneLine = HTML.make('div');
                    HTML.setId(cloneLine, 'drag-clone-line');
                    const lineWidth = (dayElemLeft + colWidth) - quarterCircleLeft + 2;
                    HTML.setStyle(cloneLine, {
                        position: 'fixed', width: String(lineWidth) + 'px', height: String(reminderLineHeight) + 'px',
                        top: String(reminderTopPosition) + 'px', left: String(quarterCircleLeft) + 'px',
                        backgroundColor: accentColorVar, zIndex: String(currentGroupZIndex + indexIncreaseOnHover), cursor: 'ns-resize'
                    });
                    HTML.body.appendChild(cloneLine);
                    draggedElements.push(cloneLine);
                    
                    // Create clone quarter circle
                    const cloneQuarterCircle = HTML.make('div');
                    HTML.setId(cloneQuarterCircle, 'drag-clone-quarter-circle');
                    const gradientMask = `radial-gradient(circle at bottom right, transparent 0, transparent ${quarterCircleRadius}px, black ${quarterCircleRadius + 1}px)`;
                    const maskSizeValue = `${quarterCircleRadius * 2}px ${quarterCircleRadius * 2}px`;
                    HTML.setStyle(cloneQuarterCircle, {
                        position: 'fixed', width: String(quarterCircleRadius) + 'px', height: String(quarterCircleRadius) + 'px',
                        top: String(reminderTopPosition + reminderLineHeight) + 'px', left: String(quarterCircleLeft) + 'px',
                        backgroundColor: accentColorVar, zIndex: String(currentGroupZIndex + indexIncreaseOnHover),
                        webkitMaskImage: gradientMask, maskImage: gradientMask, webkitMaskSize: maskSizeValue, maskSize: maskSizeValue,
                        webkitMaskPosition: 'bottom right', maskPosition: 'bottom right', webkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat',
                    });
                    HTML.body.appendChild(cloneQuarterCircle);
                    draggedElements.push(cloneQuarterCircle);

                    // --- End of new logic ---
                    
                    G_reminderDragState = {
                        isDragging: true,
                        dayIndex: dayIndex,
                        groupIndex: currentGroupIndex,
                        groupElements: draggedElements, // Use the new clone elements
                        initialTops: draggedElements.map(el => parseFloat(el.style.top)),
                        initialY: e.clientY,
                        timedAreaTop: timedAreaTop,
                        timedAreaHeight: timedAreaHeight,
                        dayStartUnix: dayStartUnix,
                        dayEndUnix: dayEndUnix,
                        reminderGroup: [stackedReminder], // Only this one reminder
                        isClone: true, // Flag that we are dragging a clone
                        originalStackElements: { // to restore on drag end
                            mainCount: mainCountElement,
                            stackedText: originalStackedText,
                            stackedCount: originalStackedCount,
                        }
                    };

                    // Temporarily remove the dragged reminder from user data for re-rendering
                    const entity = user.entityArray.find(e => e.id === stackedReminder.id);
                    const reminderInstance = entity.data.instances[stackedReminder.patternIndex];
                    const originalInstances = entity.data.instances;
                    
                    // Create a temporary copy without the dragged instance
                    const tempInstances = [...entity.data.instances];
                    tempInstances.splice(stackedReminder.patternIndex, 1);
                    entity.data.instances = tempInstances;

                    // Immediately re-render the current day to update the remaining stack
                    const dayToRender = currentDays()[dayIndex];
                    const dayElementToRender = HTML.get('day' + dayIndex);
                    renderDay(dayToRender, dayElementToRender, dayIndex);
                    
                    // Restore the original instances array
                    entity.data.instances = originalInstances;

                    // Create time indicator bubble for individual drag
                    let timeBubble = HTML.make('div');
                    HTML.setId(timeBubble, 'dragTimeBubble');
                    const bubbleHeight = reminderLineHeight + reminderTextHeight - 2;
                    const dayElement = HTML.get('day' + dayIndex);
                    const dayLeft = parseInt(dayElement.style.left);
                    
                    // Hide initially to prevent flickering
                    HTML.setStyle(timeBubble, {
                        position: 'fixed',
                        height: String(bubbleHeight) + 'px',
                        width: '34px',
                        backgroundColor: 'var(--shade-2)',
                        color: 'var(--shade-4)',
                        fontSize: '9.5px', // Bigger font
                        fontFamily: 'JetBrains Mono',
                        borderTopRightRadius: String(bubbleHeight / 2) + 'px',
                        borderBottomRightRadius: String(bubbleHeight / 2) + 'px',
                        borderTopLeftRadius: '0px',
                        borderBottomLeftRadius: '0px',
                        paddingTop: String(reminderLineHeight - 1) + 'px', // Align with reminder text
                        boxSizing: 'border-box',
                        zIndex: '600', // higher than hour marker but below outline
                        whiteSpace: 'nowrap',
                        pointerEvents: 'none',
                        visibility: 'hidden', // Hide initially
                        textAlign: 'center',
                        paddingRight: '1.5px'
                    });
                    
                    // Set initial position and content
                    const initialTop = reminderTopPosition;
                    HTML.setStyle(timeBubble, {
                        top: String(initialTop) + 'px',
                        left: String(dayLeft) + 'px'
                    });
                    
                    // Calculate initial time based on mouse position
                    const initialProportionOfDay = (initialTop - timedAreaTop) / timedAreaHeight;
                    const totalDayDurationMs = dayEndUnix - dayStartUnix;
                    const initialTimeOffsetMs = initialProportionOfDay * totalDayDurationMs;
                    const initialTimestamp = dayStartUnix + initialTimeOffsetMs;
                    const initialDateTime = DateTime.fromMillis(initialTimestamp);
                    const initialSnappedMinute = Math.round(initialDateTime.minute / 5) * 5;
                    const initialDisplayDateTime = initialDateTime.set({ minute: initialSnappedMinute, second: 0, millisecond: 0 });
                    
                    // Format time according to user preference (no AM/PM)
                    let initialTimeText;
                    if (user.settings.ampmOr24 === '24') {
                        initialTimeText = initialDisplayDateTime.toFormat('HH:mm');
                    } else {
                        initialTimeText = initialDisplayDateTime.toFormat('h:mm');
                    }
                    timeBubble.innerHTML = initialTimeText;
                    
                    // Append to body
                    HTML.body.appendChild(timeBubble);
                    
                    // Show after everything is set up
                    HTML.setStyle(timeBubble, { visibility: 'visible' });

                    document.addEventListener('mousemove', handleReminderDragMove);
                    document.addEventListener('mouseup', handleReminderDragEnd);

                    // No need to increase z-index here, it's set high on creation
                };

                HTML.setStyle(stackedTextElement, {
                    position: 'fixed',
                    top: String(reminderTopPosition) + 'px', // Start at same level as main reminder (hidden behind it)
                    left: String(dayElemLeft + spaceForHourMarkers) + 'px',
                    backgroundColor: darkenedColor,
                    height: String(reminderTextHeight) + 'px',
                    paddingTop: '1px', // Reduced from 2px to shift text up by 1px
                    paddingLeft: String(adjustedTextPaddingLeft) + 'px',
                    paddingRight: String(textPaddingRight) + 'px',
                    boxSizing: 'border-box',
                    color: 'var(--shade-4)',
                    fontSize: reminderTextFontSize,
                    fontFamily: 'Inter',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    width: String(textElementActualWidth) + 'px',
                    zIndex: String(currentGroupZIndex - stackIndex), // Higher stackIndex = lower z-index (further back)
                    borderRadius: '6px',
                    opacity: '0',
                    cursor: 'pointer'
                });

                // Create stack count indicator
                let stackCountElement = HTML.getUnsafely(`day${dayIndex}reminderStackCount${currentGroupIndex}_${stackIndex}`);
                if (!exists(stackCountElement)) {
                    stackCountElement = HTML.make('div');
                    HTML.setId(stackCountElement, `day${dayIndex}reminderStackCount${currentGroupIndex}_${stackIndex}`);
                    HTML.body.appendChild(stackCountElement);
                }
                
                // Remove old listeners
                stackCountElement.removeEventListener('mouseenter', stackCountElement.mouseEnterHandler);
                stackCountElement.removeEventListener('mouseleave', stackCountElement.mouseLeaveHandler);

                stackCountElement.mouseEnterHandler = handleReminderMouseEnter;
                stackCountElement.mouseLeaveHandler = handleReminderMouseLeave;
                stackCountElement.addEventListener('mouseenter', stackCountElement.mouseEnterHandler);
                stackCountElement.addEventListener('mouseleave', stackCountElement.mouseLeaveHandler);
                stackCountElement.innerHTML = String(stackNumber);
                
                HTML.setStyle(stackCountElement, {
                    position: 'fixed',
                    top: String(reminderTopPosition + 1) + 'px', // Moved down 1px total from original 1px position
                    left: String(dayElemLeft + spaceForHourMarkers + textPaddingLeft) + 'px',
                    width: String(countIndicatorSize) + 'px',
                    height: String(countIndicatorSize) + 'px',
                    backgroundColor: 'var(--shade-4)', // White background
                    color: darkenedColor, // Number color matches the reminder's background
                    fontSize: '8px',
                    fontFamily: 'Inter',
                    fontWeight: 'bold',
                    textAlign: 'center',
                    lineHeight: String(countIndicatorSize) + 'px',
                    borderRadius: '50%',
                    zIndex: String(currentGroupZIndex - stackIndex),
                    opacity: '0',
                    cursor: 'pointer'
                });
            }
        } else {
            log("Single reminder (not grouped) for group " + groupIndex);
        }

        // Cleanup stale stacked elements if the group has shrunk or is no longer a group
        const stackCleanupStartIndex = isGrouped ? group.length : 1;
        let stackCleanupIndex = stackCleanupStartIndex;
        while (true) {
            const staleStackText = HTML.getUnsafely(`day${dayIndex}reminderStackText${currentGroupIndex}_${stackCleanupIndex}`);
            const staleStackCount = HTML.getUnsafely(`day${dayIndex}reminderStackCount${currentGroupIndex}_${stackCleanupIndex}`);
            
            if (!exists(staleStackText) && !exists(staleStackCount)) {
                break; // No more stale elements for this group
            }
            
            if (exists(staleStackText)) staleStackText.remove();
            if (exists(staleStackCount)) staleStackCount.remove();
            
            stackCleanupIndex++;
        }

        groupIndex++;
    }

    // Remove stale reminder elements
    let existingReminderIndex = groupIndex;
    while(true) {
        const lineElement = HTML.getUnsafely(`day${dayIndex}reminderLine${existingReminderIndex}`);
        if (!exists(lineElement)) {
            // If the line element is gone, we assume all other elements for this index are too.
            break; 
        }

        // Helper to remove an element by its generated ID
        const removeElementById = (id) => {
            const el = HTML.getUnsafely(id);
            if(exists(el)) el.remove();
        };

        removeElementById(`day${dayIndex}reminderLine${existingReminderIndex}`);
        removeElementById(`day${dayIndex}reminderText${existingReminderIndex}`);
        removeElementById(`day${dayIndex}reminderQuarterCircle${existingReminderIndex}`);
        removeElementById(`day${dayIndex}reminderCount${existingReminderIndex}`);
        
        let stackIdx = 1;
        while(true) {
            const stackText = HTML.getUnsafely(`day${dayIndex}reminderStackText${existingReminderIndex}_${stackIdx}`);
            if(!exists(stackText)) break;
            
            removeElementById(`day${dayIndex}reminderStackText${existingReminderIndex}_${stackIdx}`);
            removeElementById(`day${dayIndex}reminderStackCount${existingReminderIndex}_${stackIdx}`);
            stackIdx++;
        }

        existingReminderIndex++;
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
            // outline elements
            let outlineElement = HTML.getUnsafely('day' + String(i) + 'Outline');
            if (exists(outlineElement)) {
                outlineElement.remove();
            }

            // Cleanup for all-day events and reminders for the removed day column
            let j = 0;
            while (true) {
                let staleElement = HTML.getUnsafely(`day${i}allDayEvent${j}`);
                if (exists(staleElement)) {
                    staleElement.remove();
                    j++;
                } else {
                    break;
                }
            }
            j = 0;
            while (true) {
                let staleElement = HTML.getUnsafely(`day${i}reminderLine${j}`);
                if (exists(staleElement)) {
                    // To be thorough, remove all parts of the reminder group
                    const removeElementById = (id) => {
                        const el = HTML.getUnsafely(id);
                        if(exists(el)) el.remove();
                    };
                    removeElementById(`day${i}reminderLine${j}`);
                    removeElementById(`day${i}reminderText${j}`);
                    removeElementById(`day${i}reminderQuarterCircle${j}`);
                    removeElementById(`day${i}reminderCount${j}`);
                    let stackIdx = 1;
                    while(true) {
                        const stackText = HTML.getUnsafely(`day${i}reminderStackText${j}_${stackIdx}`);
                        if(!exists(stackText)) break;
                        removeElementById(`day${i}reminderStackText${j}_${stackIdx}`);
                        removeElementById(`day${i}reminderStackCount${j}_${stackIdx}`);
                        stackIdx++;
                    }
                    j++;
                } else {
                    break;
                }
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
            border: '1px solid ' + 'var(--shade-3)',
            borderRadius: '5px',
            backgroundColor: 'var(--shade-0)',
            zIndex: '300' // below hour markers
        });
        HTML.body.appendChild(dayElement);

        // add outline element with very high z-index for border
        let outlineElement = HTML.getUnsafely('day' + String(i) + 'Outline');
        if (!exists(outlineElement)) {
            outlineElement = HTML.make('div');
            HTML.setId(outlineElement, 'day' + String(i) + 'Outline');
        }

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

        HTML.setStyle(outlineElement, {
            position: 'fixed',
            width: String(columnWidth) + 'px',
            height: String(height + topOfCalendarDay) + 'px',
            top: String(topOfBackground) + 'px',
            left: String(left) + 'px',
            border: '1px solid ' + 'var(--shade-3)',
            borderRadius: '5px',
            backgroundColor: 'transparent',
            pointerEvents: 'none', // Don't interfere with interactions
            zIndex: '4100' // reminders occupy 2600 to 4041
        });
        HTML.body.appendChild(outlineElement);

        HTML.setStyle(backgroundElement, {
            position: 'fixed',
            width: String(columnWidth) + 'px',
            height: String(height + topOfCalendarDay) + 'px',
            top: String(topOfBackground) + 'px',
            left: String(left) + 'px',
            backgroundColor: 'var(--shade-1)',
            border: '1px solid ' + 'var(--shade-3)',
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
            color: 'var(--shade-3)',
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
            color: 'var(--shade-3)',
            fontFamily: 'Inter',
            fontWeight: 'bold',
            zIndex: '400'
        });
        dayOfWeekText.innerHTML = dayOfWeekOrRelativeDay(days[i]);
        if (dayOfWeekOrRelativeDay(days[i]) == 'Today') {
            // white text for today
            HTML.setStyle(dateText, { color: 'var(--shade-4)' });
            HTML.setStyle(dayOfWeekText, { color: 'var(--shade-4)' });
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
    backgroundColor: 'var(--shade-1)',
    fontSize: '12px',
    color: 'var(--shade-3)',
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
    backgroundColor: 'var(--shade-1)',
    fontSize: '12px',
    color: 'var(--shade-3)',
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
    backgroundColor: 'var(--shade-1)',
    fontSize: '12px',
    color: 'var(--shade-3)',
});
buttonStacking.onclick = toggleStacking;
buttonStacking.innerHTML = 'Toggle Stacking';
HTML.body.appendChild(buttonStacking);

window.onresize = render;

// init call
render();