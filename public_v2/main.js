// start loading fonts immediately on page load
const fontDefinitions = [
    { key: 'PrimaryRegular', url: 'https://super-publisher.pages.dev/YOOOOOOOOOOOOO.woff2' },
    { key: 'PrimaryBold', url: 'https://super-publisher.pages.dev/Bold.woff2' },
    // { key: 'PrimaryExtraBold', url: 'https://super-publisher.pages.dev/Extrabold.woff2' },
    // { key: 'PrimaryBlack', url: 'https://super-publisher.pages.dev/Black.woff2' },
    { key: 'Monospaced', url: 'https://super-publisher.pages.dev/JetBrainsMono-Regular.woff2' }
];

let preservedFontCss = {};
for (const font of fontDefinitions) {
    preservedFontCss[font.key] = localStorage.getItem('font' + font.key + font.url);
}

const DateTime = luxon.DateTime; // .local() sets the timezone to the user's timezone

// the first day shown in calendar
let firstDayInCalendar;

const allDayEventHeight = 18; // height in px for each all-day event
const columnWidthThreshold = 300; // px
const spaceForTaskDateAndTime = 30; // px
const vibrantRedColor = '#ff4444';

let activeCheckboxIds = new Set();

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

function hexToRgb(hex) {
    var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    };
}

function formatTaskTime(time, fontSize, colonColor) {
    ASSERT(type(time, TimeField));
    ASSERT(type(user, User));
    ASSERT(user.settings.ampmOr24 === 'ampm' || user.settings.ampmOr24 === '24');
    ASSERT(type(fontSize, Number));
    ASSERT(type(colonColor, String));

    let hour = time.hour;
    const minute = time.minute.toString().padStart(2, '0');
    const colonStyle = `margin-left: 0px; margin-right: 0px; position: relative; top: -0.05em; color: ${colonColor}; font-size: ${fontSize}px;`;

    if (user.settings.ampmOr24 === '24') {
        return `${hour.toString()}<span style="${colonStyle}">:</span>${minute}`;
    } else { // ampm
        const period = hour >= 12 ? 'PM' : 'AM';
        if (hour > 12) {
            hour -= 12;
        } else if (hour === 0) {
            hour = 12;
        }
        return `${hour}<span style="${colonStyle}">:</span>${minute}${period}`;
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
        accent: ['#7900bf', '#a82190'],
        events: ['#3a506b', '#5b7553', '#7e4b4b', '#4f4f6b', '#6b5b4f'],
        shades: ['#191919', '#383838', '#464646', '#9e9e9e', '#ffffff']
    },
    'midnight': {
        accent: ['#a82190', '#003fd2'],
        events: ['#47b6ff', '#b547ff'],
        shades: ['#000000', '#6e6e6e', '#d1d1d1', '#9e9e9e', '#ffffff']
    }
    // TODO: add more palettes
};

// load sample data
if (TESTING) {
    localStorage.clear();
    log("Clean slate");

    const baseDate = DateTime.local(); // Use a single base for all calculations
    const today = new DateField(baseDate.year, baseDate.month, baseDate.day);

    const yesterdayDate = baseDate.minus({days: 1});
    const yesterday = new DateField(yesterdayDate.year, yesterdayDate.month, yesterdayDate.day);

    const tomorrowDate = baseDate.plus({days: 1});
    const tomorrow = new DateField(tomorrowDate.year, tomorrowDate.month, tomorrowDate.day);

    const in2DaysDate = baseDate.plus({days: 2});
    const in2Days = new DateField(in2DaysDate.year, in2DaysDate.month, in2DaysDate.day);

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
    
    const in2MonthsDate = baseDate.plus({months: 2});
    const in2Months = new DateField(in2MonthsDate.year, in2MonthsDate.month, in2MonthsDate.day);

    // Calculate next Saturday for event-004
    let nextSaturdayDateCalc = baseDate;
    while(nextSaturdayDateCalc.weekday !== 6) { // Luxon: Saturday is 6
        nextSaturdayDateCalc = nextSaturdayDateCalc.plus({days: 1});
    }
    const nextSaturday = new DateField(nextSaturdayDateCalc.year, nextSaturdayDateCalc.month, nextSaturdayDateCalc.day);

    // Create sample tasks and events
    let entityArray = [
        new Entity(
            'task-overdue-001', // id
            'Overdue today at 6 AM', // name
            '', // description
            new TaskData( // data
                [
                    new NonRecurringTaskInstance(
                        today, // date
                        new TimeField(6, 0), // dueTime
                        false // completion
                    )
                ], // instances
                NULL, // hideUntil
                true, // showOverdue
                [] // workSessions
            ) // data
        ),

        new Entity(
            'task-overdue-002', // id
            'Overdue yesterday no time', // name
            '', // description
            new TaskData( // data
                [
                    new NonRecurringTaskInstance(
                        yesterday, // date
                        NULL, // dueTime
                        false // completion
                    )
                ], // instances
                NULL, // hideUntil
                true, // showOverdue
                [] // workSessions
            ) // data
        ),

        // Due today, no time
        new Entity(
            'task-due-today-no-time', // id
            'Due Today', // name
            '', // description
            new TaskData( // data
                [
                    new NonRecurringTaskInstance(
                        today, // date
                        NULL, // dueTime
                        false // completion
                    )
                ], // instances
                NULL, // hideUntil
                true, // showOverdue
                [] // workSessions
            ) // data
        ),

        // one-time task with work time
        new Entity(
            'task-001', // id
            'Final Project', // name
            '', // description
            new TaskData( // data
                [
                    new NonRecurringTaskInstance(
                        in3Days, // date
                        new TimeField(22, 0), // dueTime
                        false // completion
                    )
                ], // instances
                NULL, // hideUntil
                true, // showOverdue
                [
                    // working on it every day
                    new RecurringEventInstance(
                        new EveryNDaysPattern(
                            today, // initialDate
                            1 // n
                        ), // startDatePattern
                        new TimeField(6, 30), // startTime
                        new TimeField(7, 30), // endTime
                        new DateRange(
                            today, // startDate
                            in2Days // endDate
                        ), // range
                        NULL // differentEndDatePattern
                    ),
                    // submission
                    new NonRecurringEventInstance(
                        in2Days, // startDate
                        new TimeField(14, 30), // startTime
                        new TimeField(15, 30), // endTime
                        NULL // differentEndDate
                    )
                ] // workSessions
            ) // data
        ),
    
        // recurring weekly task with completion
        new Entity(
            'task-002', // id
            'Weekly task', // name
            '', // description
            new TaskData( // data
                [
                    new RecurringTaskInstance(
                        new EveryNDaysPattern(
                            today, // initialDate
                            7 // n
                        ), // datePattern
                        new TimeField(22, 0), // dueTime
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
            'Monthly task', // name
            '', // description
            new TaskData( // data
                [
                    new RecurringTaskInstance(
                        new MonthlyPattern(1, [false, false, false, false, false, false, false, false, false, false, true, true]), // datePattern (1st of every month)
                        new TimeField(10, 0), // dueTime
                        new RecurrenceCount(new DateField(2025, 1, 1), 6), // repeats 6 times, not 6 years
                        [] // completion
                    )
                ], // instances
                NULL, // hideUntil
                true, // showOverdue
                [] // workSessions
            ) // data
        ),

        // task overdue yesterday with time
        new Entity(
            'task-004', // id
            'Overdue yesterday with time', // name
            '', // description
            new TaskData( // data
                [
                    new NonRecurringTaskInstance(
                        yesterday, // date
                        new TimeField(10, 0), // dueTime
                        false // completion
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
            'First all day thing tomorrow long long long', // name
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

        new Entity(
            'event-700', // id
            'Second', // name
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

        // one-time event from 8am to 9 45am
        new Entity(
            'event-111111', // id
            'THING', // name
            '', // description
            new EventData( // data
                [
                    new NonRecurringEventInstance(
                        tomorrow, // startDate
                        new TimeField(8, 0), // startTime
                        new TimeField(9, 45), // endTime
                        NULL // differentEndDate
                    )
                ] // instances
            )
        ),

        new Entity(
            'event-222222', // id
            '2 events at same time', // name
            '', // description
            new EventData( // data
                [
                    new NonRecurringEventInstance(
                        in2Days, // startDate
                        new TimeField(16, 0), // startTime
                        new TimeField(17, 0), // endTime
                        NULL // differentEndDate
                    )
                ] // instances
            )
        ),
        new Entity(
            'event-333333', // id
            'Another event at same time', // name
            '', // description
            new EventData( // data
                [
                    new NonRecurringEventInstance(
                        in2Days, // startDate
                        new TimeField(16, 0), // startTime
                        new TimeField(20, 0), // endTime
                        NULL // differentEndDate
                    )
                ] // instances
            )
        ),

        new Entity(
            'event-444444', // id
            'Random garbage', // name
            '', // description
            new EventData( // data
                [
                    new NonRecurringEventInstance(
                        in2Days, // startDate
                        new TimeField(16, 30), // startTime
                        new TimeField(17, 30), // endTime
                        NULL // differentEndDate
                    )
                ] // instances
            )
        ),
        
        new Entity(
            'event-555555', // id
            'Random garbage 2', // name
            '', // description
            new EventData( // data
                [
                    new NonRecurringEventInstance(
                        in2Days, // startDate
                        new TimeField(18, 0), // startTime
                        new TimeField(19, 0), // endTime
                        NULL // differentEndDate
                    )
                ] // instances
            )
        ),

        new Entity(
            'event-666666', // id
            'Ambiguous ending time event', // name
            '', // description
            new EventData( // data
                [
                    new NonRecurringEventInstance(
                        in2Days, // startDate
                        new TimeField(18, 0), // startTime
                        NULL, // endTime
                        NULL // differentEndDate
                    )
                ] // instances
            )
        ),

        new Entity(
            'event-777777', // id
            'Event spanning 3 days', // name
            '', // description
            new EventData( // data
                [
                    new NonRecurringEventInstance(
                        tomorrow, // startDate
                        new TimeField(18, 0), // startTime
                        new TimeField(19, 0), // endTime
                        in3Days // differentEndDate
                    )
                ] // instances
            )
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
                        new RecurrenceCount(nextSaturday, 4), // range
                        1 // differentEndDatePattern (e.g. workshop lasts 2 days, so end is start + 1 day)
                    )
                ] // instances
            ) // data
        ),

        // recurring weekend workshop with multi-day span
        new Entity(
            'event-456', // id
            'Sleepover', // name
            '', // description
            new EventData( // data
                [
                    new RecurringEventInstance(
                        new EveryNDaysPattern(
                            today, // initialDate
                            7 // n
                        ), // startDatePattern
                        new TimeField(10, 0), // startTime
                        new TimeField(16, 0), // endTime
                        new RecurrenceCount(today, 4), // range
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
                    new RecurrenceCount(today, 3) // For 3 days
                ),
                new RecurringReminderInstance(
                    new EveryNDaysPattern(today, 1), // Daily starting today
                    new TimeField(21, 0),
                    new RecurrenceCount(today, 3) // For 3 days
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
                    new TimeField(9, 40)
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
        ),

        // all day recurring event
        new Entity(
            'event-555', // id
            'Daily planning', // name
            '', // description
            new EventData( // data
                [
                    new RecurringEventInstance(
                        new EveryNDaysPattern(
                            today, // initialDate
                            1 // n (daily)
                        ), // startDatePattern
                        NULL, // startTime (all-day)
                        NULL, // endTime (all-day)
                        new RecurrenceCount(today, 2),
                        NULL // differentEndDatePattern
                    )
                ] // instances
            ) // data
        ),

        new Entity(
            'reminder-003',
            "Bro's Birthday",
            "Don't forget to send wishes!",
            new ReminderData([
                new NonRecurringReminderInstance(
                    in3Days, // date
                    new TimeField(10, 0)
                )
            ])
        ),
    ];

    // Create user object with the sample data
    let user = new User(
        entityArray,
        {
            stacking: false,
            numberOfCalendarDays: 3,
            ampmOr24: 'ampm',
            startOfDayOffset: 0,
            endOfDayOffset: 0,
        },
        palettes.dark
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
    if (palette.events) {
        palette.events.forEach((color, index) => {
            root.style.setProperty(`--event-${index}`, color);
    });
    }
}

let user = loadUserData();
applyPalette(user.palette);
// Set firstDayInCalendar to today on page load
firstDayInCalendar = getDayNDaysFromToday(0);
ASSERT(type(user, User));

let gapBetweenColumns = 14;
let windowBorderMargin = 6;
let columnWidth; // portion of screen
let headerSpace = 20; // px gap at top to make space for logo and buttons

const timedEventBaseZIndex = 500;
const reminderBaseZIndex = 3400;
const reminderIndexIncreaseOnHover = 1441; // 1440 minutes in a day, so this way it must be on top of all other reminders
const currentTimeIndicatorZIndex = 5000; // > than 3400+1441
const timeBubbleZIndex = 5001; // above currentTimeIndicatorZIndex

const taskInfoDateFontBigCol = 10; // px
const taskInfoTimeFontBigCol = 9; // px
const taskInfoLineTwoFontBigCol = 8; // px
const taskInfoAsteriskFontBigCol = 14; // px
const taskInfoDateFontSmallCol = 10; // px
const taskInfoTimeFontSmallCol = 8; // px
const taskInfoLineTwoFontSmallCol = 7; // px
const taskInfoAsteriskFontSmallCol = 12; //px

// Reminder dimensions - all based on font size for consistency
const reminderFontSize = 12; // px
const reminderTextHeight = Math.round(reminderFontSize * 1.4); // 17px
const reminderQuarterCircleRadius = reminderFontSize; // 12px  
const reminderBorderRadius = Math.round(reminderTextHeight * 0.5);
const reminderCountIndicatorSize = Math.round(reminderFontSize); // 14px (bigger circle)
const reminderCountFontSize = Math.round(reminderFontSize * 0.75); // 9px (slightly bigger font to match)

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
    getElement(id) {
        ASSERT(type(id, String));
        let element = document.getElementById(id);
        ASSERT(exists(element), `HTML.get element with id ${id} DNE`);
        
        // Check if multiple elements share the same ID
        ASSERT(document.querySelectorAll(`#${id}`).length === 1, `HTML.get found ${document.querySelectorAll(`#${id}`).length} elements with id ${id}, should be exactly 1`);
        
        return element;
    }

    // get but it may not exist
    getElementUnsafely(id) {
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

    applyAnimation(element, trigger, keyframes, options) {
        ASSERT(exists(element) && type(trigger, NonEmptyString));
        ASSERT(type(keyframes, Array));
        ASSERT(type(options, Object) && exists(options.duration) && exists(options.iterations) && exists(options.easing));

        element.addEventListener(trigger, () => {
            element.animate(keyframes, options);
        });
    }

    createClass(name, styles) {
        ASSERT(type(name, String));
        ASSERT(type(styles, Dict(String, String)));
    
        let styleElement = this.make('style');
    
        let styleString = Object.entries(styles).map(([key, value]) => `${key}: ${value};`).join('');
    
        styleElement.textContent = `.${name} {${styleString}}`;
        this.head.appendChild(styleElement);
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
        font-family: 'PrimaryRegular';
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
const logoHeight = 22.15; // i measured it

function toggleCheckbox(checkboxElement) {
    let isChecked = HTML.getData(checkboxElement, 'IS_CHECKED');
    ASSERT(type(isChecked, Boolean));
    isChecked = !isChecked;

    if (isChecked) {
        checkboxElement.style.borderColor = 'var(--shade-2)';
        checkboxElement.style.backgroundColor = 'var(--shade-2)';
    } else {
        checkboxElement.style.borderColor = 'var(--shade-3)';
        checkboxElement.style.backgroundColor = 'transparent';
    }
    
    // set data property
    HTML.setData(checkboxElement, 'IS_CHECKED', isChecked);

    // update the stripe element
    const taskNumber = checkboxElement.id.split('-')[2];
    const stripeElement = HTML.getElementUnsafely(`task-overdue-stripe-${taskNumber}`);
    if (exists(stripeElement)) {
        if (isChecked) {
            stripeElement.style.opacity = '0';
        } else {
            stripeElement.style.opacity = '0.5';
        }
    }

    // update the task text element
    const taskElement = HTML.getElementUnsafely(`task-${taskNumber}`);
    if (exists(taskElement)) {
        if (isChecked) {
            taskElement.style.color = 'var(--shade-3)';
            taskElement.style.textDecoration = 'line-through';
        } else {
            taskElement.style.color = 'white';
            taskElement.style.textDecoration = 'none';
        }
    }

    // update the time and date elements if they exist
    const line1Element = HTML.getElementUnsafely(`task-info-line1-${taskNumber}`);
    if (exists(line1Element)) {
        if (isChecked) {
            line1Element.style.color = 'var(--shade-3)';
        } else {
            // restore original color based on overdue status
            const stripeElement = HTML.getElement(`task-overdue-stripe-${taskNumber}`);
            if (stripeElement.style.display === 'none') {
                // if the stripe element is not visible, then the task is not overdue
                line1Element.style.color = 'var(--shade-3)';
            } else {
                line1Element.style.color = vibrantRedColor;
            }
        }
    }

    const line2Element = HTML.getElementUnsafely(`task-info-line2-${taskNumber}`);
    if (exists(line2Element)) {
        if (isChecked) {
            line2Element.style.color = 'var(--shade-3)';
        } else {
            // restore original color based on overdue status
            const stripeElement = HTML.getElement(`task-overdue-stripe-${taskNumber}`);
            if (stripeElement.style.display === 'none') {
                // if the stripe element is not visible, then the task is not overdue
                line2Element.style.color = 'var(--shade-3)';
            } else {
                line2Element.style.color = vibrantRedColor;
            }
        }
    }

    // update colon element if it exists
    let children = NULL;
    if (exists(line1Element) && line1Element.children.length > 0) {
        children = line1Element.children;
    } else if (exists(line2Element) && line2Element.children.length > 0) {
        children = line2Element.children;
    }
    if (children !== NULL) {
        ASSERT(children.length === 1);
        const colonElement = children[0];
        if (isChecked) {
            colonElement.style.color = 'var(--shade-3)';
        } else {
            const stripeElement = HTML.getElement(`task-overdue-stripe-${taskNumber}`);
            if (stripeElement.style.display === 'none') {
                colonElement.style.color = 'var(--shade-3)';
            } else {
                colonElement.style.color = vibrantRedColor;
            }
        }
    }

    // update the task object itself in the user's entity array
    const taskId = HTML.getData(checkboxElement, 'TASK_ID');
    const instanceIndex = HTML.getData(checkboxElement, 'INSTANCE_INDEX');
    ASSERT(type(taskId, String));
    ASSERT(type(instanceIndex, Int));
    
    // Find the task entity in user's entity array
    const taskEntity = user.entityArray.find(entity => entity.id === taskId);
    ASSERT(type(taskEntity, Entity));
    ASSERT(type(taskEntity.data, TaskData));
    const instance = taskEntity.data.instances[instanceIndex];
    if (type(instance, NonRecurringTaskInstance)) {
        // For non-recurring tasks, simply toggle the completion boolean
        instance.completion = isChecked;
    } else if (type(instance, RecurringTaskInstance)) {
        const dueDateUnix = HTML.getData(checkboxElement, 'DUE_DATE_UNIX');
        const initialNumberOfCompletions = instance.completion.length;
        ASSERT(type(dueDateUnix, Int));
        // For recurring tasks, manage the completion array with unix timestamps
        if (isChecked) {
            // Add completion unix timestamp if not already present
            if (!instance.completion.includes(dueDateUnix)) {
                instance.completion.push(dueDateUnix);
            }
        } else {
            // Remove completion unix timestamp
            instance.completion = instance.completion.filter(completedUnix => completedUnix !== dueDateUnix);
        }
        ASSERT(Math.abs(instance.completion.length - initialNumberOfCompletions) <= 1, "Recurring task completion array length changed by more than 1");
    }

    // quick update the task section names
    updateTaskSectionNames();

    // Save the updated user data
    saveUserData(user);
}

// quick function to know whether a section color should be white for active or grey for inactive
function updateTaskSectionNames() {
    let activeColor = 'var(--shade-4)';
    let inactiveColor = 'var(--shade-3)';

    // get the task section names
    const taskSectionNameInactive = {"Today" : true, "Tomorrow" : true, "Week" : true};

    // get the curent section status so we can see if one goes from unfinished to finished
    // then we play a confetti animation
    const initiallyActive = {"Today" : true, "Tomorrow" : true, "Week" : true};
    // get the color
    for (const [taskSectionName, _] of Object.entries(taskSectionNameInactive)) {
        const taskSectionElement = HTML.getElement(`taskListHeader-${taskSectionName}`);
        const taskSectionColor = taskSectionElement.style.color;
        // this 
        if (taskSectionColor === activeColor) {
            initiallyActive[taskSectionName] = true;
        } else {
            initiallyActive[taskSectionName] = false;
        }
    }

    log(initiallyActive);

    // get all the checkboxes
    for (const id of activeCheckboxIds) {
        const checkboxElement = HTML.getElement(id);
        const isArbitraryBoxChecked = HTML.getData(checkboxElement, 'IS_CHECKED');
        ASSERT(type(isArbitraryBoxChecked, Boolean));
        if (!isArbitraryBoxChecked) {
            log('isArbitraryBoxChecked is false for id: ' + id);
            const taskSectionName = HTML.getData(checkboxElement, 'SECTION');
            log('taskSectionName: ' + taskSectionName);
            taskSectionNameInactive[taskSectionName] = false;
        }
    }

    for (const [taskSectionName, isInactive] of Object.entries(taskSectionNameInactive)) {
        const taskSectionElement = HTML.getElement(`taskListHeader-${taskSectionName}`);
        if (isInactive) {
            taskSectionElement.style.color = inactiveColor;
        } else {
            log('active for id: ' + taskSectionName);
            taskSectionElement.style.color = activeColor;
        }
    }

    log(taskSectionNameInactive);

    // see if any of them weren't complete before and are now complete
    for (const [taskSectionName, isInactive] of Object.entries(taskSectionNameInactive)) {
        log('taskSectionName: ' + taskSectionName);
        log('isInactive: ' + isInactive);
        log('initiallyActive[taskSectionName]: ' + initiallyActive[taskSectionName]);
        if (initiallyActive[taskSectionName] && isInactive) {
            log('play confetti animation');
            // play a confetti animation
            playConfettiAnimation();
        }
    }
}

let confettiAnimationCurrentlyPlaying = false;
function playConfettiAnimation() {
    if (confettiAnimationCurrentlyPlaying) {
        return;
    }

    // the animation goes here

    confettiAnimationCurrentlyPlaying = true;    
}

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
        startDateTime = DateTime.local(instance.range.startDate.year, instance.range.startDate.month, instance.range.startDate.day);
    } else if (type(instance.range, RecurrenceCount)) {
        let baseDate = DateTime.local(instance.range.initialDate.year, instance.range.initialDate.month, instance.range.initialDate.day);
        
        // For RecurrenceCount, we need to find the first actual occurrence of the pattern starting from the initial date
        if (type(pattern, EveryNDaysPattern)) {
            startDateTime = baseDate;
        } else if (type(pattern, MonthlyPattern)) {
            // Find the first valid month from the base date
            startDateTime = baseDate.set({day: pattern.day});
            while (!pattern.months[startDateTime.month - 1]) {
                startDateTime = startDateTime.plus({months: 1}).set({day: pattern.day});
            }
        } else if (type(pattern, AnnuallyPattern)) {
            startDateTime = baseDate.set({month: pattern.month, day: pattern.day});
            // If the date has already passed in the base year, use next year
            if (startDateTime < baseDate) {
                startDateTime = startDateTime.plus({years: 1});
            }
        } else if (type(pattern, NthWeekdayOfMonthsPattern)) {
            startDateTime = baseDate;
            // This will be refined in the generation loop to find the actual first occurrence
        } else {
            startDateTime = baseDate;
        }
    } else if (type(pattern, EveryNDaysPattern)) {
        startDateTime = DateTime.local(pattern.initialDate.year, pattern.initialDate.month, pattern.initialDate.day);
    } else if (type(pattern, MonthlyPattern)) {
        // For MonthlyPattern, we need a reference date - use current date as fallback
        // Find the first occurrence from today
        let currentDate = DateTime.local();
        startDateTime = currentDate.set({day: pattern.day});
        // Find the first valid month from current date
        while (!pattern.months[startDateTime.month - 1]) {
            startDateTime = startDateTime.plus({months: 1}).set({day: pattern.day});
        }
    } else if (type(pattern, AnnuallyPattern)) {
        // For AnnuallyPattern, use current year or next year if already passed
        let currentDate = DateTime.local();
        startDateTime = currentDate.set({month: pattern.month, day: pattern.day});
        // If the date has already passed this year, use next year
        if (startDateTime < currentDate) {
            startDateTime = startDateTime.plus({years: 1});
        }
    } else if (type(pattern, NthWeekdayOfMonthsPattern)) {
        // For NthWeekdayOfMonthsPattern, find the first occurrence from current date
        let currentDate = DateTime.local();
        startDateTime = currentDate;
        // This will be refined in the generation loop to find the actual first occurrence
    } else {
        ASSERT(false, "Unknown pattern type in generateInstancesFromPattern");
    }
    
    // Determine the recurrence's own end date
    let recurrenceEndDateTime;
    if (type(instance.range, DateRange) && instance.range.endDate !== NULL) {
        ASSERT(type(instance.range.endDate, DateField));
        recurrenceEndDateTime = DateTime.local(instance.range.endDate.year, instance.range.endDate.month, instance.range.endDate.day).endOf('day');
    } else if (type(instance.range, RecurrenceCount)) {
        // For RecurrenceCount, we don't set an end date - the count will limit the instances
        recurrenceEndDateTime = NULL;
    } else {
        // No range specified, so no end date
        recurrenceEndDateTime = NULL;
    }

    const dates = [];
    let currentDateTime = startDateTime;
    let count = 0;
    // max of 10000 instances if it's a recurring pattern that doesn't have a count
    const maxCount = type(instance.range, RecurrenceCount) ? instance.range.count : 10000;
    while ((recurrenceEndDateTime === NULL || currentDateTime <= recurrenceEndDateTime) && count < maxCount) {
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
                    currentDateTime = (recurrenceEndDateTime || DateTime.local().plus({years: 5})).plus({days: 1}); // Force exit
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
            while (!foundNext && (recurrenceEndDateTime === NULL || currentDateTime <= recurrenceEndDateTime)) {
                currentDateTime = currentDateTime.plus({ days: 1 }); // Increment day by day to find the next match

                if (recurrenceEndDateTime !== NULL && currentDateTime > recurrenceEndDateTime) {
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
                     currentDateTime = recurrenceEndDateTime ? recurrenceEndDateTime.plus({days: 1}) : currentDateTime.plus({years: 10}); // force exit
                     break;
                }
            }
            if (!foundNext) {
                 // If no next date found within limits, effectively end the loop for this pattern
                 if (recurrenceEndDateTime) currentDateTime = recurrenceEndDateTime.plus({days: 1});
                 // else, if no recurrenceEndDateTime, we might have hit maxCount or an arbitrary break
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

class FilteredInstancesFactory {
    // Processes a single work session instance from a TaskEntity
    static fromTaskWorkSession(taskEntity, workSessionInstance, workSessionPatternIndex, dayDateField, dayStartUnix, dayEndUnix) {
        const results = [];
        const entityId = taskEntity.id;
        const entityName = taskEntity.name; // Or specific name for work session if available/different
        // we want to know if the entire task is complete
        // even if it's complete for some days, the work sessions
        // should still be shown because they can still make progress
        const taskIsComplete = taskEntity.data.isComplete(NULL, NULL);

        // Common properties for the instances derived from this workSessionInstance
        const originalStartDate = workSessionInstance.startDatePattern ? workSessionInstance.startDatePattern.initialDate : workSessionInstance.startDate;
        const originalStartTime = workSessionInstance.startTime;

        if (workSessionInstance.startTime === NULL) { // All-day work session
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

                // this logic seems weird but it's correct
                // it's so you can have multi-day work sessions that span multiple days
                if ((workStartMs <= dayEndUnix && workEndMs >= dayStartUnix)) {
                    const ambiguousEndTime = workSessionInstance.endTime === NULL;
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
                        workSessionPatternIndex,
                        ambiguousEndTime
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
                    const ambiguousEndTime = workSessionInstance.endTime === NULL;

                    // this logic seems weird but it's correct
                    // it's so you can have multi-day work sessions that span multiple days
                    if (startMs <= dayEndUnix && endMs >= dayStartUnix) {
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
                            workSessionPatternIndex,
                            ambiguousEndTime
                        ));
                    }
                }
            }
        }
        return results;
    }

    static fromEvent(eventEntity, eventInstance, eventPatternIndex, dayDateField, dayStartUnix, dayEndUnix) {
        const results = [];
        const entityId = eventEntity.id;
        const entityName = eventEntity.name;

        const originalStartDate = eventInstance.startDatePattern ? eventInstance.startDatePattern.initialDate : eventInstance.startDate;
        const originalStartTime = eventInstance.startTime;

        if (eventInstance.startTime === NULL) { // All-day event
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
                let ambiguousEndTime = false;
                if (eventInstance.endTime === NULL) {
                    eventEndDateTime = eventStartDateTime.plus({ minutes: 100 }); // Default duration for events with no end time
                    ambiguousEndTime = true;
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

                // this logic seems weird but it's correct
                // it's so you can have multi-day events that span multiple days
                if (eventStartMs <= dayEndUnix && eventEndMs >= dayStartUnix) {
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
                        eventPatternIndex,
                        ambiguousEndTime
                    ));
                }
            } else { // Recurring timed event
                let dayBeforeMs = DateTime.local(dayDateField.year, dayDateField.month, dayDateField.day).minus({ days: 1 }).startOf('day').toMillis();
                let dayAfterMs = DateTime.local(dayDateField.year, dayDateField.month, dayDateField.day).plus({ days: 1 }).endOf('day').toMillis();
                let patternStartTimes = generateInstancesFromPattern(eventInstance, dayBeforeMs, dayAfterMs);

                for (let startMs of patternStartTimes) {
                    let instanceStartDateTime = DateTime.fromMillis(startMs);
                    let instanceEndDateTime;
                    let ambiguousEndTime = false;

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
                        ambiguousEndTime = true;
                    }
                    let endMs = instanceEndDateTime.toMillis();
                    
                    // this logic seems weird but it's correct
                    // it's so you can have multi-day events that span multiple days
                    if (startMs <= dayEndUnix && endMs >= dayStartUnix) {
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
                            eventPatternIndex,
                            ambiguousEndTime
                        ));
                    }
                }
            }
        }
        return results;
    }

    static fromReminder(reminderEntity, reminderInstance, reminderPatternIndex, dayDateField, dayStartUnix, dayEndUnix) {
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

function renderDay(day, index) {
    ASSERT(type(day, DateField) && type(index, Int));
    
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
            if (entity.data.workSessions.length > 0) {
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

    // adjust day element height and vertical pos to fit all day events at the top (below text but above hour markers)
    const totalAllDayEventsHeight = G_filteredAllDayInstances.length * allDayEventHeight + 4; // 12px margin for more space between all-day events and timed calendar
    
    // Get the original dimensions that were set by renderCalendar(), not the current modified ones
    const dayColumnDimensions = getDayColumnDimensions(index);
    const originalHeight = dayColumnDimensions.height;
    const originalTop = dayColumnDimensions.top;
    const dayElementLeft = dayColumnDimensions.left;
    
    // Calculate new top and height for the main timed event area within the day element
    let timedEventAreaHeight = originalHeight - totalAllDayEventsHeight;
    let timedEventAreaTop = originalTop + totalAllDayEventsHeight;
    
    // Now create or update all the hour markers and hour marker text based on the new timedEventArea dimensions
    if (HTML.getElementUnsafely(`day${index}hourMarker1`) == null) { // create hour markers
        // if one is missing, all 24 must be missing
        for (let j = 0; j < 25; j++) {
            let hourMarker = HTML.make('div');
            HTML.setId(hourMarker, `day${index}hourMarker${j}`);
            
            HTML.setStyle(hourMarker, {
                position: 'fixed',
                width: String(columnWidth) + 'px',
                height: '1px',
                top: String(timedEventAreaTop + (j * timedEventAreaHeight / 24)) + 'px',
                left: String(dayElementLeft) + 'px',
                backgroundColor: 'var(--shade-2)',
                zIndex: '400'
            });
            
            HTML.body.appendChild(hourMarker);

            if (j < 24) {
                // create hour marker text
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
                    top: String(timedEventAreaTop + (j * timedEventAreaHeight / 24) + 1) + 'px',
                    left: String(dayElementLeft) + 'px',
                    color: 'var(--shade-2)',
                    fontFamily: 'Monospaced',
                    fontSize: fontSize,
                    zIndex: '401'
                });
                
                HTML.setData(hourMarkerText, 'leadingWhitespace', true);
                hourMarkerText.innerHTML = nthHourText(j);
                HTML.body.appendChild(hourMarkerText);
            }
        }
    } else { // update hour markers
        for (let j = 0; j < 25; j++) {
            let hourPosition = timedEventAreaTop + (j * timedEventAreaHeight / 24);
            
            let hourMarker = HTML.getElementUnsafely(`day${index}hourMarker${j}`);
            if (!hourMarker) {
                hourMarker = HTML.make('div');
                HTML.setId(hourMarker, `day${index}hourMarker${j}`);
                HTML.body.appendChild(hourMarker);
                 HTML.setStyle(hourMarker, {
                    position: 'fixed',
                    height: '1px',
                    backgroundColor: 'var(--shade-3)',
                    zIndex: '400'
                });
            }
            
            HTML.setStyle(hourMarker, {
                top: String(hourPosition) + 'px',
                left: String(dayElementLeft) + 'px',
                width: String(columnWidth) + 'px'
            });

            if (j < 24) {
                // adjust position of hour marker text
                let hourMarkerText = HTML.getElement(`day${index}hourMarkerText${j}`);
                
                HTML.setStyle(hourMarkerText, {
                    top: String(hourPosition + 1) + 'px',
                    left: String(dayElementLeft) + 'px'
                });
            }
        }
    }
    
    renderAllDayInstances(G_filteredAllDayInstances, index, columnWidth, originalTop, dayElementLeft);
    renderSegmentOfDayInstances(G_filteredSegmentOfDayInstances, index, columnWidth, timedEventAreaTop, timedEventAreaHeight, dayElementLeft, startOfDay, endOfDay);
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
    ASSERT(type(dayElemLeft, Number));

    for (let i = 0; i < allDayInstances.length; i++) {
        let allDayEventData = allDayInstances[i];
        // All-day events are positioned from the dayElementActualTop (original top of the day column)
        let allDayEventTopPosition = dayElementActualTop + (i * allDayEventHeight) + 2;
        
        let allDayEventElement = HTML.getElementUnsafely(`day${dayIndex}allDayEvent${i}`);
        if (!exists(allDayEventElement)) {
            allDayEventElement = HTML.make('div');
            HTML.setId(allDayEventElement, `day${dayIndex}allDayEvent${i}`);
            HTML.body.appendChild(allDayEventElement);
        }
        
        allDayEventElement.innerHTML = allDayEventData.name;

        // Make all-day event font size responsive
        const allDayEventFontSize = colWidth > columnWidthThreshold ? '14px' : '12px';
        HTML.setStyle(allDayEventElement, {
            position: 'fixed',
            width: String(colWidth) + 'px',
            height: String(allDayEventHeight - 2) + 'px',
            top: String(allDayEventTopPosition) + 'px',
            left: String(dayElemLeft) + 'px',
            backgroundColor: 'transparent',
            opacity: String(allDayEventData.ignore ? 0.5 : 1),
            borderRadius: '3px',
            zIndex: '350',
            color: 'var(--shade-4)',
            fontSize: allDayEventFontSize,
            fontFamily: 'PrimaryRegular',
            lineHeight: String(allDayEventHeight - 2) + 'px', // Center text vertically
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            paddingLeft: '12px',
            paddingRight: '2px',
            boxSizing: 'border-box',
            cursor: 'pointer',
            transition: 'background-color 0.2s ease, opacity 0.2s ease, font-size 0.3s ease'
        });
        
        // Add hover effects using event listeners instead of CSS hover
        allDayEventElement.addEventListener('mouseenter', function() {
            allDayEventElement.style.backgroundColor = 'var(--shade-1)';
            if (allDayEventData.ignore) {
                allDayEventElement.style.opacity = '1';
            }
        });
        
        allDayEventElement.addEventListener('mouseleave', function() {
            allDayEventElement.style.backgroundColor = 'transparent';
            if (allDayEventData.ignore) {
                allDayEventElement.style.opacity = '0.5';
            }
        });

        // Create/Update asterisk indicator
        let asteriskElement = HTML.getElementUnsafely(`day${dayIndex}allDayEventAsterisk${i}`);
        if (!exists(asteriskElement)) {
            asteriskElement = HTML.make('div');
            HTML.setId(asteriskElement, `day${dayIndex}allDayEventAsterisk${i}`);
            HTML.body.appendChild(asteriskElement);
        }
        
        asteriskElement.innerHTML = '*';
        HTML.setStyle(asteriskElement, {
            position: 'fixed',
            top: String(allDayEventTopPosition) + 'px', // move it down a bit so it's at the center of the event
            left: String(dayElemLeft + 2) + 'px', // Position to the left of the text
            width: '60px', // Reserve much more space for date/time display
            color: 'var(--shade-3)',
            fontSize: '11px',
            fontFamily: 'Monospaced',
            lineHeight: String(allDayEventHeight - 2) + 'px',
            zIndex: '351',
            pointerEvents: 'none' // Don't interfere with event interactions
        });
    }

    let existingAllDayEventIndex = allDayInstances.length;
    let extraAllDayEventElement = HTML.getElementUnsafely(`day${dayIndex}allDayEvent${existingAllDayEventIndex}`);
    while (exists(extraAllDayEventElement)) {
        extraAllDayEventElement.remove();
        
        // Also remove the corresponding asterisk element
        let extraAsteriskElement = HTML.getElementUnsafely(`day${dayIndex}allDayEventAsterisk${existingAllDayEventIndex}`);
        if (exists(extraAsteriskElement)) {
            extraAsteriskElement.remove();
        }
        
        existingAllDayEventIndex++;
        extraAllDayEventElement = HTML.getElementUnsafely(`day${dayIndex}allDayEvent${existingAllDayEventIndex}`);
    }
}

function renderSegmentOfDayInstances(segmentInstances, dayIndex, colWidth, timedAreaTop, timedAreaHeight, dayElemLeft, dayStartUnix, dayEndUnix) {
    ASSERT(type(segmentInstances, List(FilteredSegmentOfDayInstance)));
    ASSERT(type(dayIndex, Int));
    ASSERT(type(colWidth, Number));
    ASSERT(type(timedAreaTop, Number));
    ASSERT(type(timedAreaHeight, Number));
    ASSERT(type(dayElemLeft, Number));
    ASSERT(type(dayStartUnix, Int));
    ASSERT(type(dayEndUnix, Int));

    // 1. Sort instances by start time, then by duration as a tie-breaker
    segmentInstances.sort((a, b) => {
        if (a.startDateTime !== b.startDateTime) {
            return a.startDateTime - b.startDateTime;
        }
        return (b.endDateTime - b.startDateTime) - (a.endDateTime - a.startDateTime);
    });

    // 2. Group instances that start at the same time
    const instanceGroups = [];
    if (segmentInstances.length > 0) {
        let currentGroup = [segmentInstances[0]];
        for (let i = 1; i < segmentInstances.length; i++) {
            if (segmentInstances[i].startDateTime === currentGroup[0].startDateTime) {
                currentGroup.push(segmentInstances[i]);
            } else {
                instanceGroups.push(currentGroup);
                currentGroup = [segmentInstances[i]];
            }
        }
        instanceGroups.push(currentGroup);
    }
    
    // Pass 1: Determine lane for each group
    const layoutInfo = [];
    const lanes = []; // Stores arrays of event end times for each lane

    for (const group of instanceGroups) {
        const groupStartTime = group[0].startDateTime;
        let laneIndex = 0;
        while (true) {
            if (!lanes[laneIndex]) {
                lanes[laneIndex] = [];
                break;
            }
            if (lanes[laneIndex].some(endTime => groupStartTime < endTime)) {
                laneIndex++;
            } else {
                break;
            }
        }
        
        const maxEndTimeInGroup = Math.max(...group.map(inst => inst.endDateTime));
        lanes[laneIndex].push(maxEndTimeInGroup);
        
        layoutInfo.push({ group, laneIndex });
    }

    // Pass 2: Render instances based on layout info
    const indentation = 10; // px per lane
    const spaceForHourMarkers = 32;
    const totalAvailableWidth = colWidth - spaceForHourMarkers;
    let renderedInstanceCount = 0;

    for (const { group, laneIndex } of layoutInfo) {
        const widthForLane = totalAvailableWidth - (laneIndex * indentation);
        const gap = 2; // gap between events in the same group
        const itemWidth = (widthForLane - (group.length - 1) * gap) / group.length;

        for (const [instanceIndexInGroup, instance] of group.entries()) {
            const dayDuration = dayEndUnix - dayStartUnix;
            if (dayDuration <= 0) continue;

            const topOffset = instance.startDateTime - dayStartUnix;
            const top = timedAreaTop + (topOffset / dayDuration) * timedAreaHeight;

            const duration = instance.endDateTime - instance.startDateTime;
            let height = (duration / dayDuration) * timedAreaHeight;
            
            height = Math.max(height, 3);
            if (top + height > timedAreaTop + timedAreaHeight) {
                height = timedAreaTop + timedAreaHeight - top;
            }

            const leftForLane = dayElemLeft + spaceForHourMarkers + (laneIndex * indentation);
            const left = leftForLane + (instanceIndexInGroup * (itemWidth + gap));
            const width = itemWidth;

            const eventStartDateTime = DateTime.fromMillis(instance.startDateTime);
            const minutesFromMidnight = eventStartDateTime.hour * 60 + eventStartDateTime.minute;
            // 2 per minute since we need one per minute for event and one per minute for border
            const instanceZIndex = timedEventBaseZIndex + minutesFromMidnight * 2;

            const eventId = `day${dayIndex}segment${renderedInstanceCount}`;
            let eventElement = HTML.getElementUnsafely(eventId);
            if (!exists(eventElement)) {
                eventElement = HTML.make('div');
                HTML.setId(eventElement, eventId);
                HTML.body.appendChild(eventElement);
            } else {
                if (eventElement.mouseEnterHandler) {
                    eventElement.removeEventListener('mouseenter', eventElement.mouseEnterHandler);
                }
                if (eventElement.mouseLeaveHandler) {
                    eventElement.removeEventListener('mouseleave', eventElement.mouseLeaveHandler);
                }
            }
            eventElement.innerHTML = instance.name;

            const colorVar = `--event-${laneIndex % user.palette.events.length}`;

            // Make timed event font size responsive
            const timedEventFontSize = colWidth > columnWidthThreshold ? '14px' : '12px';
            let style = {
                position: 'fixed',
                top: `${top}px`,
                left: `${left}px`,
                width: `${width}px`,
                height: `${height}px`,
                backgroundColor: `var(${colorVar})`,
                borderRadius: '8px',
                color: 'var(--shade-4)',
                fontSize: timedEventFontSize,
                fontFamily: 'PrimaryRegular',
                paddingTop: '2px',
                paddingRight: '8px',
                paddingBottom: '3px',
                paddingLeft: '6px',
                whiteSpace: 'normal',
                overflow: 'hidden',
                cursor: 'pointer',
                boxSizing: 'border-box',
                zIndex: String(instanceZIndex),
                transition: 'font-size 0.3s ease'
            };

            if (instance.ambiguousEndTime) {
                const eventColorHex = getComputedStyle(document.documentElement).getPropertyValue(colorVar).trim();
                if (eventColorHex.startsWith('#') && eventColorHex.length === 7) {
                    const r = parseInt(eventColorHex.slice(1, 3), 16);
                    const g = parseInt(eventColorHex.slice(3, 5), 16);
                    const b = parseInt(eventColorHex.slice(5, 7), 16);
                    style.background = `linear-gradient(rgb(${r}, ${g}, ${b}) 0%, rgb(${r}, ${g}, ${b}) 20%, rgba(${r}, ${g}, ${b}, 0.6) 60%, rgba(${r}, ${g}, ${b}, 0.4) 70%, rgba(${r}, ${g}, ${b}, 0.2) 85%, rgba(${r}, ${g}, ${b}, 0.1) 90%, rgba(${r}, ${g}, ${b}, 0) 100%)`;
                    style.borderBottomLeftRadius = '0px';
                    style.borderBottomRightRadius = '0px';
                } else {
                    // Fallback for non-hex colors or parsing errors
                    style.backgroundColor = `var(${colorVar})`;
                }
            } else {
                style.backgroundColor = `var(${colorVar})`;
            }

            if (instance.wrapToPreviousDay) {
                style.borderTopLeftRadius = '0px';
                style.borderTopRightRadius = '0px';
            }
            if (instance.wrapToNextDay) {
                style.borderBottomLeftRadius = '0px';
                style.borderBottomRightRadius = '0px';
            }

            HTML.setStyle(eventElement, style);

            const eventColor = `var(${colorVar})`;
            eventElement.mouseEnterHandler = function() {
                // Create and show border element
                let borderOverlay = HTML.getElementUnsafely(`${eventId}_borderOverlay`);
                if (exists(borderOverlay)) {
                    if (borderOverlay.fadeOutTimeout) {
                        clearTimeout(borderOverlay.fadeOutTimeout);
                        delete borderOverlay.fadeOutTimeout;
                    }
                    borderOverlay.style.opacity = '1';
                } else {
                    borderOverlay = HTML.make('div');
                    HTML.setId(borderOverlay, `${eventId}_borderOverlay`);
                    
                    let borderStyle = {
                        position: 'fixed',
                        top: `${top}px`,
                        left: `${left}px`,
                        width: `${width}px`,
                        height: `${height}px`,
                        pointerEvents: 'none',
                        zIndex: String(instanceZIndex + 1), // Above event, below text overlay
                        borderRadius: '8px',
                        border: '2px solid var(--shade-4)',
                        boxSizing: 'border-box',
                        transition: 'opacity 0.15s ease',
                        opacity: '0'
                    };
                    
                    if (instance.ambiguousEndTime) {
                        borderStyle.borderBottom = 'none';
                        borderStyle.borderRadius = '8px 8px 0 0';
                        const maskGradient = `linear-gradient(to bottom, black 20%, rgba(0, 0, 0, 0.6) 60%, rgba(0, 0, 0, 0.4) 70%, rgba(0, 0, 0, 0.2) 85%, rgba(0, 0, 0, 0.1) 90%, transparent 100%)`;
                        borderStyle.webkitMask = maskGradient;
                        borderStyle.mask = maskGradient;
                    }
                    
                    if (instance.wrapToPreviousDay) {
                        borderStyle.borderTopLeftRadius = '0px';
                        borderStyle.borderTopRightRadius = '0px';
                    }
                    if (instance.wrapToNextDay && !instance.ambiguousEndTime) { 
                        borderStyle.borderBottomLeftRadius = '0px';
                        borderStyle.borderBottomRightRadius = '0px';
                    }
                    
                    HTML.setStyle(borderOverlay, borderStyle);
                    HTML.body.appendChild(borderOverlay);
                    
                    // Fade in
                    setTimeout(() => { if (HTML.getElementUnsafely(`${eventId}_borderOverlay`)) borderOverlay.style.opacity = '1' }, 10);
                }

                eventElement.style.textShadow = `-1px -1px 0 ${eventColor}, 1px -1px 0 ${eventColor}, -1px 1px 0 ${eventColor}, 1px 1px 0 ${eventColor}`;
                
                // Check if text overlay already exists
                let textOverlay = HTML.getElementUnsafely(`${eventId}_textOverlay`);
                
                if (exists(textOverlay)) {
                    // Clear any pending removal timeout
                    if (textOverlay.fadeOutTimeout) {
                        clearTimeout(textOverlay.fadeOutTimeout);
                        delete textOverlay.fadeOutTimeout;
                    }
                    // Just fade it in
                    textOverlay.style.opacity = '1';
                } else {
                    // Create new high z-index text overlay
                    textOverlay = HTML.make('div');
                    HTML.setId(textOverlay, `${eventId}_textOverlay`);
                    textOverlay.innerHTML = instance.name;
                    
                    HTML.setStyle(textOverlay, {
                        position: 'fixed',
                        top: `${top}px`,
                        left: `${left}px`,
                        width: `${width}px`,
                        height: `${height}px`,
                        color: 'var(--shade-4)',
                        fontSize: timedEventFontSize,
                        fontFamily: 'PrimaryRegular',
                        paddingTop: '2px',
                        paddingRight: '8px',
                        paddingBottom: '3px',
                        paddingLeft: '6px',
                        whiteSpace: 'normal',
                        overflow: 'visible',
                        boxSizing: 'border-box',
                        zIndex: String(instanceZIndex + reminderBaseZIndex + reminderIndexIncreaseOnHover + 1), // above all reminders
                        pointerEvents: 'none',
                        opacity: '0',
                        transition: 'opacity 0.2s ease-in-out, font-size 0.3s ease',
                        textShadow: `-1px -1px 0 ${eventColor}, 1px -1px 0 ${eventColor}, -1px 1px 0 ${eventColor}, 1px 1px 0 ${eventColor}`
                    });
                    
                    HTML.body.appendChild(textOverlay);
                    
                    // Fade in
                    setTimeout(() => {
                        if (HTML.getElementUnsafely(`${eventId}_textOverlay`)) {
                            textOverlay.style.opacity = '1';
                        }
                    }, 10);
                }
            };
            eventElement.mouseLeaveHandler = function() {
                eventElement.style.textShadow = 'none';

                // Fade out and remove border overlay
                const borderOverlay = HTML.getElementUnsafely(`${eventId}_borderOverlay`);
                if (exists(borderOverlay)) {
                    borderOverlay.style.opacity = '0';
                    borderOverlay.fadeOutTimeout = setTimeout(() => {
                        const overlayToRemove = HTML.getElementUnsafely(`${eventId}_borderOverlay`);
                        if (exists(overlayToRemove)) {
                            overlayToRemove.remove();
                        }
                    }, 150); // Match transition duration
                }
                
                // Fade out and remove text overlay
                const textOverlay = HTML.getElementUnsafely(`${eventId}_textOverlay`);
                if (exists(textOverlay)) {
                    textOverlay.style.opacity = '0';
                    textOverlay.fadeOutTimeout = setTimeout(() => {
                        const overlayToRemove = HTML.getElementUnsafely(`${eventId}_textOverlay`);
                        if (exists(overlayToRemove)) {
                            overlayToRemove.remove();
                        }
                    }, 200); // Match transition duration
                }
            };
            eventElement.addEventListener('mouseenter', eventElement.mouseEnterHandler);
            eventElement.addEventListener('mouseleave', eventElement.mouseLeaveHandler);
            
            renderedInstanceCount++;
        }
    }

    // Cleanup stale elements
    let i = renderedInstanceCount;
    while(true) {
        const staleElement = HTML.getElementUnsafely(`day${dayIndex}segment${i}`);
        if (staleElement) {
            staleElement.remove();
            i++;
        } else {
            break;
        }
    }
}

// A map to keep track of running animation frames for each reminder group
const G_animationFrameMap = new Map();

function updateStackPositions(dayIndex, groupIndex, isHovering, timedAreaTop, timedAreaHeight) {
    ASSERT(type(dayIndex, Int) && type(groupIndex, Int) && type(isHovering, Boolean));
    ASSERT(type(timedAreaTop, Number) && type(timedAreaHeight, Number));

    // Calculate scaled dimensions based on column width
    const colWidth = getDayColumnDimensions(dayIndex).width;
    const reminderTextHeight = Math.round((colWidth > columnWidthThreshold ? 14 : 12) * 1.4);

    const animationKey = `${dayIndex}-${groupIndex}`;

    // Cancel any previous animation frame for this group to avoid conflicts
    if (G_animationFrameMap.has(animationKey)) {
        cancelAnimationFrame(G_animationFrameMap.get(animationKey));
        G_animationFrameMap.delete(animationKey);
    }
    
    const primaryTextElement = HTML.getElementUnsafely(`day${dayIndex}reminderText${groupIndex}`);
    if (!exists(primaryTextElement)) {
        // Elements might have been removed by a re-render, so we stop.
        return; 
    }
    
    // Assert that this is part of a stack.
    const firstStackElement = HTML.getElementUnsafely(`day${dayIndex}reminderStackText${groupIndex}_1`);
    ASSERT(exists(firstStackElement), `updateStackPositions called for a non-stacked reminder: day${dayIndex}, group${groupIndex}`);

    const reminderLineElement = HTML.getElementUnsafely(`day${dayIndex}reminderLine${groupIndex}`);
    ASSERT(exists(reminderLineElement));
    const lineTop = parseFloat(reminderLineElement.style.top);

    let groupLength = 1;
    while (HTML.getElementUnsafely(`day${dayIndex}reminderStackText${groupIndex}_${groupLength}`)) {
        groupLength++;
    }

    // Decide whether to expand upwards or downwards
    const timedAreaBottom = timedAreaTop + timedAreaHeight;
    const requiredHeight = groupLength * reminderTextHeight;
    const expandUpwards = (lineTop + requiredHeight) > timedAreaBottom;
    
    const baseAnimationTop = parseFloat(primaryTextElement.style.top);

    function animationLoop() {
        let anyChanges = false;
        
        for (let stackIndex = 1; stackIndex < groupLength; stackIndex++) {
            let stackedText = HTML.getElementUnsafely(`day${dayIndex}reminderStackText${groupIndex}_${stackIndex}`);
            let stackedCount = HTML.getElementUnsafely(`day${dayIndex}reminderStackCount${groupIndex}_${stackIndex}`);
            
            if (exists(stackedText) && exists(stackedCount)) {
                const expandedTop = expandUpwards 
                    ? baseAnimationTop - (reminderTextHeight * stackIndex)
                    : baseAnimationTop + (reminderTextHeight * stackIndex);

                const expandedCountTop = expandedTop + 2.5; // Shifted down 1px from main count indicator
                const hiddenTop = baseAnimationTop;
                const hiddenCountTop = baseAnimationTop + 2.5;
                
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
    const minTop = timedAreaTop;
    const maxTop = timedAreaTop + timedAreaHeight - reminderLineHeight; // Allow line to go to the very bottom

    // Calculate scaled dimensions based on column width
    const colWidth = getDayColumnDimensions(dayIndex).width;
    const localReminderFontSize = colWidth > columnWidthThreshold ? 14 : 12;
    const localReminderTextHeight = Math.round(localReminderFontSize * 1.4);
    const localReminderQuarterCircleRadius = localReminderFontSize;
    const localReminderBorderRadius = Math.round(localReminderTextHeight * 0.5);

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
                el.style.top = `${clampedLineTop - localReminderTextHeight + 2}px`;
                el.style.height = `${localReminderTextHeight}px`;
                el.style.paddingTop = '1px';
                // Flip border radius for the new orientation
                el.style.borderTopLeftRadius = `${localReminderBorderRadius}px`;
                el.style.borderBottomLeftRadius = `${localReminderBorderRadius}px`;
                el.style.borderTopRightRadius = `${localReminderBorderRadius}px`; 
                el.style.borderBottomRightRadius = '0px'; 
            } else {
                // Original position below the line
                el.style.top = `${clampedLineTop}px`;
                el.style.height = `${reminderLineHeight + localReminderTextHeight - 2}px`;
                el.style.paddingTop = `${reminderLineHeight - 1}px`;
                // Original border radius
                el.style.borderTopLeftRadius = `${localReminderBorderRadius}px`;
                el.style.borderBottomLeftRadius = `${localReminderBorderRadius}px`;
                el.style.borderTopRightRadius = '0px';
                el.style.borderBottomRightRadius = `${localReminderBorderRadius}px`;
            }
        
        } else if (el.id.includes('QuarterCircle') || el.id.includes('quarter-circle')) {
            if (isFlipped) {
                // Position quarter circle above the line, flipped vertically
                el.style.top = `${clampedLineTop - localReminderQuarterCircleRadius}px`;
                const gradientMask = `radial-gradient(circle at top right, transparent 0, transparent ${localReminderQuarterCircleRadius}px, black ${localReminderQuarterCircleRadius + 1}px)`;
                el.style.webkitMaskImage = gradientMask;
                el.style.maskImage = gradientMask;
                el.style.webkitMaskPosition = 'top right';
                el.style.maskPosition = 'top right';
            } else {
                // Original position below the line
                el.style.top = `${clampedLineTop + reminderLineHeight}px`;
                const gradientMask = `radial-gradient(circle at bottom right, transparent 0, transparent ${localReminderQuarterCircleRadius}px, black ${localReminderQuarterCircleRadius + 1}px)`;
                el.style.webkitMaskImage = gradientMask;
                el.style.maskImage = gradientMask;
                el.style.webkitMaskPosition = 'bottom right';
                el.style.maskPosition = 'bottom right';
            }

        } else if (el.id.includes('Count') || el.id.includes('count')) {
            if (isFlipped) {
                el.style.top = `${clampedLineTop - localReminderTextHeight + 4.5}px`;
            } else {
                el.style.top = `${clampedLineTop + reminderLineHeight + 0.5}px`;
            }
        }
    });

    // Update time bubble position and text
    const timeBubble = HTML.getElementUnsafely('dragTimeBubble');
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
        const dayLeft = getDayColumnDimensions(G_reminderDragState.dayIndex).left;
        
        // Constrain bubble position to maintain 10px minimum distance from bottom
        const bubbleHeight = reminderLineHeight + reminderTextHeight - 2;
        const maxBubbleTop = timedAreaTop + timedAreaHeight - bubbleHeight - 4; // must be 4px from bottom of day
        const constrainedBubbleTop = Math.min(clampedLineTop, maxBubbleTop);
        
        HTML.setStyle(timeBubble, {
            top: String(constrainedBubbleTop) + 'px',
            left: String(dayLeft) + 'px'
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
                renderDay(dayToRender, dayIdx);
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
    const timeBubble = HTML.getElementUnsafely('dragTimeBubble');
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

    reminderGroup.forEach((reminder) => {
        const entity = user.entityArray.find(e => e.id === reminder.id);
        if (entity) {
            const reminderInstance = entity.data.instances[reminder.patternIndex];
            
            if (type(reminderInstance, NonRecurringReminderInstance)) {
                reminderInstance.time = new TimeField(finalDateTime.hour, finalDateTime.minute);
                const currentDayDateField = currentDays()[dayIndex];
                reminderInstance.date = currentDayDateField;
            } else if (type(reminderInstance, RecurringReminderInstance)) {
                reminderInstance.time = new TimeField(finalDateTime.hour, finalDateTime.minute);
            }
        }
    });

    saveUserData(user);

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
        // Re-render all visible days since recurring reminders affect multiple days
        const allDays = currentDays();
        for (let i = 0; i < allDays.length; i++) {
            const dayToRender = allDays[i];
            renderDay(dayToRender, i);
        }
    } else {
        const dayToRender = currentDays()[dayIndex];
        renderDay(dayToRender, dayIndex);
    }

    G_reminderDragState.isDragging = false;
}

function handleReminderDragCancel(e) {
    if (e.key !== 'Escape' || !G_reminderDragState.isDragging) return;
    
    e.preventDefault();
    const wasClone = G_reminderDragState.isClone;
    const dayIndex = G_reminderDragState.dayIndex;
    const reminderGroup = G_reminderDragState.reminderGroup;
    
    // Cleanup must happen before re-render
    
    document.removeEventListener('mousemove', handleReminderDragMove);
    document.removeEventListener('mouseup', handleReminderDragEnd);
    document.removeEventListener('keydown', handleReminderDragCancel);

    // Remove time bubble
    const timeBubble = HTML.getElementUnsafely('dragTimeBubble');
    if (exists(timeBubble)) {
        timeBubble.remove();
    }
    
    if (wasClone) {
        G_reminderDragState.groupElements.forEach(el => el.remove());
    }
    
    // Reset state object
    G_reminderDragState.isDragging = false;

    // Now decide what to re-render. Re-rendering from original data source effectively "cancels" the drag.
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

    if (hasRecurringReminder || wasClone) {
        log("Cancelling drag and re-rendering all visible days...");
        const allDays = currentDays();
        for (let i = 0; i < allDays.length; i++) {
            const dayToRender = allDays[i];
            renderDay(dayToRender, i);
        }
    } else {
        log("Cancelling drag and re-rendering single day...");
        const dayToRender = currentDays()[dayIndex];
        renderDay(dayToRender, dayIndex);
    }
}

// New function to render reminder instances
function renderReminderInstances(reminderInstances, dayIndex, colWidth, timedAreaTop, timedAreaHeight, dayElemLeft, dayStartUnix, dayEndUnix) {
    ASSERT(type(reminderInstances, List(FilteredReminderInstance)));
    ASSERT(type(dayIndex, Int));
    ASSERT(type(colWidth, Number));
    ASSERT(type(timedAreaTop, Number));
    ASSERT(type(timedAreaHeight, Number));
    ASSERT(type(dayElemLeft, Number));
    ASSERT(type(dayStartUnix, Int));
    ASSERT(type(dayEndUnix, Int));

    // Scale reminder dimensions based on column width, similar to other elements
    const reminderFontSize = colWidth > columnWidthThreshold ? 14 : 12; // px
    const reminderTextHeight = Math.round(reminderFontSize * 1.4); // scaled proportionally
    const reminderQuarterCircleRadius = reminderFontSize; // scaled
    const reminderCountIndicatorSize = Math.round(reminderFontSize); // scaled
    const reminderCountFontSize = Math.round(reminderFontSize * 0.75); // scaled proportionally

    const spaceForHourMarkers = 36; // px
    const reminderLineHeight = 2; // px height of the blue line
    const textPaddingLeft = 2; // px
    const textPaddingRight = 2; // px
    const countIndicatorPadding = 3; // px, space between indicator and text

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
        elements.push(HTML.getElementUnsafely(`day${dayIdx}reminderLine${grpIdx}`));
        elements.push(HTML.getElementUnsafely(`day${dayIdx}reminderText${grpIdx}`));
        elements.push(HTML.getElementUnsafely(`day${dayIdx}reminderQuarterCircle${grpIdx}`));
        if (stackSize > 1) {
            elements.push(HTML.getElementUnsafely(`day${dayIdx}reminderCount${grpIdx}`));
            for (let i = 1; i < stackSize; i++) {
                elements.push(HTML.getElementUnsafely(`day${dayIdx}reminderStackText${grpIdx}_${i}`));
                elements.push(HTML.getElementUnsafely(`day${dayIdx}reminderStackCount${grpIdx}_${i}`));
            }
        }

        return elements;
    };

    let groupIndex = 0;
    let lastVisualBottom = -1; // For tracking overlaps
    let touchingGroupColorIndex = 0; // For alternating colors

    // Sort by time to process sequentially and check for overlaps
    for (let timeKey of Object.keys(reminderGroups).sort()) {
        const group = reminderGroups[timeKey];
        // sort by name length, longest first
        // not measuring because that would be expensive
        group.sort((a, b) => b.name.length - a.name.length);
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
        const currentVisualTop = isFlipped ? (reminderTopPosition - reminderTextHeight + 2) : reminderTopPosition;

        if (lastVisualBottom !== -1 && currentVisualTop < lastVisualBottom) {
            touchingGroupColorIndex++;
        } else {
            touchingGroupColorIndex = 0; // Reset because the chain is broken
        }
        const accentColorVarName = `--accent-${touchingGroupColorIndex % user.palette.accent.length}`;
        const accentColorHex = getComputedStyle(document.documentElement).getPropertyValue(accentColorVarName).trim();
        const accentColorVar = `var(${accentColorVarName})`;

        // Calculate container height and update last position for the next iteration
        const currentVisualBottom = isFlipped ? (reminderTopPosition + reminderLineHeight) : (reminderTopPosition + reminderTextHeight);
        lastVisualBottom = currentVisualBottom;

        // Calculate minutes since start of day for z-index layering
        const reminderDateTime = DateTime.fromMillis(primaryReminder.dateTime);
        const startOfReminderDay = reminderDateTime.startOf('day');
        const minutesSinceStartOfDay = Math.floor((primaryReminder.dateTime - startOfReminderDay.toMillis()) / (1000 * 60));
        const currentGroupZIndex = reminderBaseZIndex + minutesSinceStartOfDay; // Z-index based on time of day

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
                    el.style.zIndex = parseInt(el.style.zIndex) + reminderIndexIncreaseOnHover;
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
                    el.style.zIndex = parseInt(el.dataset.originalZIndex) + reminderIndexIncreaseOnHover;
                }
            });
            
            updateStackPositions(dayIndex, currentGroupIndex, true, timedAreaTop, timedAreaHeight);
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
                updateStackPositions(dayIndex, currentGroupIndex, false, timedAreaTop, timedAreaHeight);
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
        const extraPaddingForIndicator = isGrouped ? (reminderCountIndicatorSize + countIndicatorPadding) : 2; // +2px for single reminders
        const adjustedTextPaddingLeft = textPaddingLeft + extraPaddingForIndicator;

        // Measure text width
        const measurer = HTML.make('span');
        HTML.setStyle(measurer, {
            visibility: 'hidden',
            fontFamily: 'PrimaryRegular',
            fontSize: `${reminderFontSize}px`,
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
        let lineElement = HTML.getElementUnsafely(`day${dayIndex}reminderLine${groupIndex}`);
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
            const dayLeft = getDayColumnDimensions(dayIndex).left;
            
            // Hide initially to prevent flickering
            HTML.setStyle(timeBubble, {
                position: 'fixed',
                height: String(14) + 'px',
                width: '34px',
                backgroundColor: 'var(--shade-2)',
                color: 'var(--shade-4)',
                fontSize: '9.5px', // Bigger font
                fontFamily: 'Monospaced',
                borderRadius: String(bubbleHeight / 2) + 'px',
                paddingTop: String(reminderLineHeight - 1) + 'px', // Align with reminder text
                boxSizing: 'border-box',
                zIndex: String(timeBubbleZIndex),
                whiteSpace: 'nowrap',
                pointerEvents: 'none',
                visibility: 'hidden', // Hide initially
                textAlign: 'center'
            });
            
            // Set initial position and content
            const initialTop = reminderTopPosition;
            
            // Constrain bubble position to maintain minimum distance from bottom
            const maxBubbleTop = timedAreaTop + timedAreaHeight - bubbleHeight - 4; // must be 4px from bottom of day
            const constrainedBubbleTop = Math.min(initialTop, maxBubbleTop);
            
            HTML.setStyle(timeBubble, {
                top: String(constrainedBubbleTop) + 'px',
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
            document.addEventListener('keydown', handleReminderDragCancel);

            // Increase z-index while dragging
            groupElements.forEach(el => {
                if (!el.dataset.originalZIndexForDrag) {
                    el.dataset.originalZIndexForDrag = el.style.zIndex;
                }
                ASSERT(type(el.style.zIndex, String));
                el.style.zIndex = parseInt(el.style.zIndex) + reminderIndexIncreaseOnHover;
            });
        };
        
        const lineWidth = (dayElemLeft + colWidth) - quarterCircleLeft;
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
        let textElement = HTML.getElementUnsafely(`day${dayIndex}reminderText${groupIndex}`);
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
            fontSize: `${reminderFontSize}px`,
            fontFamily: 'PrimaryRegular',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            width: String(textElementActualWidth) + 'px',
            zIndex: String(currentGroupZIndex), // Top reminder in stack gets highest z-index
            borderTopLeftRadius: `${Math.round(reminderTextHeight * 0.5)}px`,
            borderBottomLeftRadius: `${Math.round(reminderTextHeight * 0.5)}px`,
            borderTopRightRadius: isFlipped ? `${Math.round(reminderTextHeight * 0.5)}px` : '0px',
            borderBottomRightRadius: isFlipped ? '0px' : `${Math.round(reminderTextHeight * 0.5)}px`,
            cursor: 'pointer'
        });

        // Create count indicator if grouped (now directly on body)
        if (isGrouped) {
            let countElement = HTML.getElementUnsafely(`day${dayIndex}reminderCount${groupIndex}`);
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
                top: String(isFlipped ? (reminderTopPosition - reminderTextHeight + 4.5) : (reminderTopPosition + reminderLineHeight + 0.5)) + 'px',
                left: String(dayElemLeft + spaceForHourMarkers + textPaddingLeft + 1) + 'px',
                width: String(reminderCountIndicatorSize) + 'px',
                height: String(reminderCountIndicatorSize) + 'px',
                backgroundColor: 'var(--shade-4)', // White background
                color: accentColorVar, // Original blue color for the number
                fontSize: `${reminderCountFontSize}px`, // Font size based on reminder font size (8px)
                fontFamily: 'PrimaryBold',
                textAlign: 'center',
                lineHeight: String(reminderCountIndicatorSize) + 'px',
                borderRadius: '50%',
                zIndex: String(currentGroupZIndex),
                cursor: 'pointer'
            });
        } else {
            // Remove count indicator if it exists but shouldn't
            let countElement = HTML.getElementUnsafely(`day${dayIndex}reminderCount${groupIndex}`);
            if (exists(countElement)) {
                countElement.remove();
            }
        }

        // Create/Update Quarter Circle Decorative Element (now directly on body)
        let quarterCircleElement = HTML.getElementUnsafely(`day${dayIndex}reminderQuarterCircle${groupIndex}`);
        if (!exists(quarterCircleElement)) {
            quarterCircleElement = HTML.make('div');
            HTML.setId(quarterCircleElement, `day${dayIndex}reminderQuarterCircle${groupIndex}`);
            HTML.body.appendChild(quarterCircleElement);
        }

        // Set data attributes for robust matching during drag operations
        HTML.setData(quarterCircleElement, 'sourceId', primaryReminder.id);
        HTML.setData(quarterCircleElement, 'patternNumber', primaryReminder.patternIndex);

        const gradientMask = isFlipped 
            ? `radial-gradient(circle at top right, transparent 0, transparent ${reminderQuarterCircleRadius}px, black ${reminderQuarterCircleRadius + 1}px)`
            : `radial-gradient(circle at bottom right, transparent 0, transparent ${reminderQuarterCircleRadius}px, black ${reminderQuarterCircleRadius + 1}px)`;
        const maskSizeValue = `${reminderQuarterCircleRadius * 2}px ${reminderQuarterCircleRadius * 2}px`;

        HTML.setStyle(quarterCircleElement, {
            position: 'fixed',
            width: String(reminderQuarterCircleRadius) + 'px',
            height: String(reminderQuarterCircleRadius) + 'px',
            top: String(isFlipped ? (reminderTopPosition - reminderQuarterCircleRadius) : (reminderTopPosition + reminderLineHeight)) + 'px',
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
            // clip the path so when they're hovering over the transparent part, it has no hitbox, and doesn't prevent you from hovering over what's below it
            // I want to clip the path, but because of a bug in the browser, it removes a little off the top edge
            // so you actually have to shift the left and top edges by 10%
            clipPath: 'polygon(-10% -10%, 100% -10%, -10% 100%)'
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

                // measuring to know how long to make the stacked text element
                const stackedExtraPadding = reminderCountIndicatorSize + countIndicatorPadding;
                const stackedAdjustedPaddingLeft = textPaddingLeft + stackedExtraPadding;
                
                const measurer = HTML.make('span');
                HTML.setStyle(measurer, {
                    visibility: 'hidden',
                    fontFamily: 'PrimaryRegular',
                    fontSize: `${reminderFontSize}px`,
                    whiteSpace: 'nowrap',
                    display: 'inline-block',
                    position: 'absolute'
                });
                measurer.innerHTML = stackedReminder.name;
                HTML.body.appendChild(measurer);
                const stackedContentActualWidth = measurer.offsetWidth;
                HTML.body.removeChild(measurer);

                const stackedFinalWidth = stackedContentActualWidth + stackedAdjustedPaddingLeft + textPaddingRight;
                const stackedTextElementActualWidth = Math.min(stackedFinalWidth + 1, colWidth - spaceForHourMarkers - 10);

                // Create stacked text element
                let stackedTextElement = HTML.getElementUnsafely(`day${dayIndex}reminderStackText${currentGroupIndex}_${stackIndex}`);
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
                    const originalStackedText = HTML.getElement(`day${dayIndex}reminderStackText${currentGroupIndex}_${stackIndex}`);
                    const originalStackedCount = HTML.getElementUnsafely(`day${dayIndex}reminderStackCount${currentGroupIndex}_${stackIndex}`);
                    if(exists(originalStackedText)) originalStackedText.style.visibility = 'hidden';
                    if(exists(originalStackedCount)) originalStackedCount.style.visibility = 'hidden';

                    // 2. Update the main stack's count indicator temporarily
                    const mainCountElement = HTML.getElementUnsafely(`day${dayIndex}reminderCount${currentGroupIndex}`);
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
                    HTML.setStyle(measurer, { visibility: 'hidden', fontFamily: 'PrimaryRegular', fontSize: `${reminderFontSize}px`, whiteSpace: 'nowrap', position: 'absolute' });
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
                        fontSize: `${reminderFontSize}px`, fontFamily: 'PrimaryRegular', whiteSpace: 'nowrap', overflow: 'hidden',
                        textOverflow: 'ellipsis', width: String(textElementActualWidth) + 'px',
                        zIndex: String(currentGroupZIndex + reminderIndexIncreaseOnHover), borderTopLeftRadius: `${Math.round(reminderTextHeight * 0.5)}px`,
                        borderBottomLeftRadius: `${Math.round(reminderTextHeight * 0.5)}px`, borderBottomRightRadius: `${Math.round(reminderTextHeight * 0.5)}px`, borderTopRightRadius: '0px', cursor: 'ns-resize'
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
                        backgroundColor: accentColorVar, zIndex: String(currentGroupZIndex + reminderIndexIncreaseOnHover), cursor: 'ns-resize'
                    });
                    HTML.body.appendChild(cloneLine);
                    draggedElements.push(cloneLine);
                    
                    // Create clone quarter circle
                    const cloneQuarterCircle = HTML.make('div');
                    HTML.setId(cloneQuarterCircle, 'drag-clone-quarter-circle');
                    const gradientMask = `radial-gradient(circle at bottom right, transparent 0, transparent ${reminderQuarterCircleRadius}px, black ${reminderQuarterCircleRadius + 1}px)`;
                    const maskSizeValue = `${reminderQuarterCircleRadius * 2}px ${reminderQuarterCircleRadius * 2}px`;
                    HTML.setStyle(cloneQuarterCircle, {
                        position: 'fixed', width: String(reminderQuarterCircleRadius) + 'px', height: String(reminderQuarterCircleRadius) + 'px',
                        top: String(reminderTopPosition + reminderLineHeight) + 'px', left: String(quarterCircleLeft) + 'px',
                        backgroundColor: accentColorVar, zIndex: String(currentGroupZIndex + reminderIndexIncreaseOnHover),
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
                    renderDay(dayToRender, dayIndex);
                    
                    // Restore the original instances array
                    entity.data.instances = originalInstances;

                    // Create time indicator bubble for individual drag
                    let timeBubble = HTML.make('div');
                    HTML.setId(timeBubble, 'dragTimeBubble');
                    const bubbleHeight = reminderLineHeight + reminderTextHeight - 2;
                    const dayLeft = getDayColumnDimensions(dayIndex).left;
                    
                    // Hide initially to prevent flickering
                    HTML.setStyle(timeBubble, {
                        position: 'fixed',
                        height: String(bubbleHeight) + 'px',
                        width: '34px',
                        backgroundColor: 'var(--shade-2)',
                        color: 'var(--shade-4)',
                        fontSize: '9.5px', // Bigger font
                        fontFamily: 'Monospaced',
                        borderRadius: String(bubbleHeight / 2) + 'px',
                        paddingTop: String(reminderLineHeight - 1) + 'px', // Align with reminder text
                        boxSizing: 'border-box',
                        zIndex: String(timeBubbleZIndex),
                        whiteSpace: 'nowrap',
                        pointerEvents: 'none',
                        visibility: 'hidden', // Hide initially
                        textAlign: 'center',
                        paddingRight: '1.5px'
                    });
                    
                    // Set initial position and content
                    const initialTop = reminderTopPosition;
                    
                    // Constrain bubble position to maintain minimum distance from bottom
                    const maxBubbleTop = timedAreaTop + timedAreaHeight - bubbleHeight - 4; // must be 4px from bottom of day
                    const constrainedBubbleTop = Math.min(initialTop, maxBubbleTop);
                    
                    HTML.setStyle(timeBubble, {
                        top: String(constrainedBubbleTop) + 'px',
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
                    document.addEventListener('keydown', handleReminderDragCancel);

                    // No need to increase z-index here, it's set high on creation
                };

                HTML.setStyle(stackedTextElement, {
                    position: 'fixed',
                    top: String(reminderTopPosition) + 'px', // Start at same level as main reminder (hidden behind it)
                    left: String(dayElemLeft + spaceForHourMarkers) + 'px',
                    backgroundColor: darkenedColor,
                    height: String(reminderTextHeight) + 'px',
                    paddingTop: '1px', // Reduced from 2px to shift text up by 1px
                    paddingLeft: String(stackedAdjustedPaddingLeft) + 'px',
                    paddingRight: String(textPaddingRight) + 'px',
                    boxSizing: 'border-box',
                    color: 'var(--shade-4)',
                    fontSize: `${reminderFontSize}px`,
                    fontFamily: 'PrimaryRegular',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    width: String(stackedTextElementActualWidth) + 'px',
                    zIndex: String(currentGroupZIndex - stackIndex), // Higher stackIndex = lower z-index (further back)
                    borderRadius: `${Math.round(reminderTextHeight * 0.5)}px`,
                    opacity: '0',
                    cursor: 'pointer'
                });

                // Create stack count indicator
                let stackCountElement = HTML.getElementUnsafely(`day${dayIndex}reminderStackCount${currentGroupIndex}_${stackIndex}`);
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
                    top: String(reminderTopPosition + reminderLineHeight + 1.5) + 'px', // Shifted down 1px from main count indicator
                    left: String(dayElemLeft + spaceForHourMarkers + textPaddingLeft + 1) + 'px',
                    width: String(reminderCountIndicatorSize) + 'px',
                    height: String(reminderCountIndicatorSize) + 'px',
                    backgroundColor: 'var(--shade-4)', // White background
                    color: darkenedColor, // Number color matches the reminder's background
                    fontSize: `${reminderCountFontSize}px`, // Font size based on reminder font size (8px)
                    fontFamily: 'PrimaryBold',
                    textAlign: 'center',
                    lineHeight: String(reminderCountIndicatorSize) + 'px',
                    borderRadius: '50%',
                    zIndex: String(currentGroupZIndex - stackIndex),
                    opacity: '0',
                    cursor: 'pointer'
                });
            }
        }

        // Cleanup stale stacked elements if the group has shrunk or is no longer a group
        const stackCleanupStartIndex = isGrouped ? group.length : 1;
        let stackCleanupIndex = stackCleanupStartIndex;
        while (true) {
            const staleStackText = HTML.getElementUnsafely(`day${dayIndex}reminderStackText${currentGroupIndex}_${stackCleanupIndex}`);
            const staleStackCount = HTML.getElementUnsafely(`day${dayIndex}reminderStackCount${currentGroupIndex}_${stackCleanupIndex}`);
            
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
        const lineElement = HTML.getElementUnsafely(`day${dayIndex}reminderLine${existingReminderIndex}`);
        if (!exists(lineElement)) {
            // If the line element is gone, we assume all other elements for this index are too.
            break; 
        }

        // Helper to remove an element by its generated ID
        const removeElementById = (id) => {
            const el = HTML.getElementUnsafely(id);
            if(exists(el)) el.remove();
        };

        removeElementById(`day${dayIndex}reminderLine${existingReminderIndex}`);
        removeElementById(`day${dayIndex}reminderText${existingReminderIndex}`);
        removeElementById(`day${dayIndex}reminderQuarterCircle${existingReminderIndex}`);
        removeElementById(`day${dayIndex}reminderCount${existingReminderIndex}`);
        
        let stackIdx = 1;
        while(true) {
            const stackText = HTML.getElementUnsafely(`day${dayIndex}reminderStackText${existingReminderIndex}_${stackIdx}`);
            if(!exists(stackText)) break;
            
            removeElementById(`day${dayIndex}reminderStackText${existingReminderIndex}_${stackIdx}`);
            removeElementById(`day${dayIndex}reminderStackCount${existingReminderIndex}_${stackIdx}`);
            stackIdx++;
        }

        existingReminderIndex++;
    }
}

let topOfCalendarDay = 20; // px

function getDayColumnDimensions(dayIndex) {
    ASSERT(type(dayIndex, Int) && dayIndex >= 0 && dayIndex < user.settings.numberOfCalendarDays);

    let height = window.innerHeight - (2 * windowBorderMargin) - headerSpace - topOfCalendarDay;
    height -= 2; // manual adjustment, not sure why it's off by 1
    let top = windowBorderMargin + headerSpace + topOfCalendarDay;
    let left = windowBorderMargin + ((columnWidth + gapBetweenColumns) * (dayIndex + 1));
    const width = columnWidth; // columnWidth is a global

    if (user.settings.stacking) {
        height = (window.innerHeight - headerSpace - (2 * windowBorderMargin) - gapBetweenColumns) / 2 - topOfCalendarDay;
        height -= 1; // manual adjustment, not sure why it's off by 1
        if (dayIndex >= Math.floor(user.settings.numberOfCalendarDays / 2)) { // bottom half
            top += height + gapBetweenColumns + topOfCalendarDay;
            
            if (user.settings.numberOfCalendarDays % 2 == 0) {
                left = windowBorderMargin + ((columnWidth + gapBetweenColumns) * (dayIndex - Math.floor(user.settings.numberOfCalendarDays / 2) + 1));
            } else {
                left = windowBorderMargin + ((columnWidth + gapBetweenColumns) * (dayIndex - Math.floor(user.settings.numberOfCalendarDays / 2)));
            }
        } else { // top half
            left = windowBorderMargin + ((columnWidth + gapBetweenColumns) * (dayIndex + 1));
        }
    }

    return { width, height, top, left };
}

function renderCalendar(days) {
    ASSERT(type(days, List(DateField)));
    ASSERT(exists(user.settings) && exists(user.settings.numberOfCalendarDays) && days.length == user.settings.numberOfCalendarDays, "renderCalendar days must be an array of length user.settings.numberOfCalendarDays");
    ASSERT(type(user.settings.stacking, Boolean));
    for (let i = 0; i < 7; i++) {
        if (i >= user.settings.numberOfCalendarDays) { // delete excess elements if they exist
            // day background element
            /*
            let dayBackgroundElement = HTML.getUnsafely('day-background-' + String(i));
            if (dayBackgroundElement != null) {
                dayBackgroundElement.remove();
            }
            */
            // hour markers
            for (let j = 0; j <= 24; j++) {
                let hourMarker = HTML.getElementUnsafely(`day${i}hourMarker${j}`);
                if (exists(hourMarker)) {
                    hourMarker.remove();
                }
                if (j < 24) {
                    let hourMarkerText = HTML.getElementUnsafely(`day${i}hourMarkerText${j}`);
                    if (exists(hourMarkerText)) {
                        hourMarkerText.remove();
                    }
                }
            }
            // date text
            let dateText = HTML.getElementUnsafely('day' + String(i) + 'DateText');
            if (exists(dateText)) {
                dateText.remove();
            }
            // day of week text 
            let dayOfWeekText = HTML.getElementUnsafely('day' + String(i) + 'DayOfWeekText');
            if (exists(dayOfWeekText)) {
                dayOfWeekText.remove();
            }
            // Cleanup for all-day events and reminders for the removed day column
            let j = 0;
            while (true) {
                let staleElement = HTML.getElementUnsafely(`day${i}allDayEvent${j}`);
                if (exists(staleElement)) {
                    staleElement.remove();
                    
                    // Also remove corresponding asterisk element
                    let staleAsteriskElement = HTML.getElementUnsafely(`day${i}allDayEventAsterisk${j}`);
                    if (exists(staleAsteriskElement)) {
                        staleAsteriskElement.remove();
                    }
                    
                    j++;
                } else {
                    break;
                }
            }
            j = 0;
            while (true) {
                let staleElement = HTML.getElementUnsafely(`day${i}reminderLine${j}`);
                if (exists(staleElement)) {
                    // To be thorough, remove all parts of the reminder group
                    const removeElementById = (id) => {
                        const el = HTML.getElementUnsafely(id);
                        if(exists(el)) el.remove();
                    };
                    removeElementById(`day${i}reminderLine${j}`);
                    removeElementById(`day${i}reminderText${j}`);
                    removeElementById(`day${i}reminderQuarterCircle${j}`);
                    removeElementById(`day${i}reminderCount${j}`);
                    let stackIdx = 1;
                    while(true) {
                        const stackText = HTML.getElementUnsafely(`day${i}reminderStackText${j}_${stackIdx}`);
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
            
            // Cleanup for timed event segments
            j = 0;
            while(true) {
                const staleElement = HTML.getElementUnsafely(`day${i}segment${j}`);
                if (staleElement) {
                    staleElement.remove();
                    j++;
                } else {
                    break;
                }
            }
            
            continue;
        }

        const { width, height, top, left } = getDayColumnDimensions(i);

        let verticalSpacing = 3;

        // add MM-DD text to top right of background element
        let dateText = HTML.getElementUnsafely('day' + String(i) + 'DateText');
        if (!exists(dateText)) {
            dateText = HTML.make('div');
            HTML.setId(dateText, 'day' + String(i) + 'DateText');
        }
        let dateAndDayOfWeekVerticalPos = top - topOfCalendarDay;
        const dateTextFontSize = columnWidth > columnWidthThreshold ? '16px' : '14px';
        HTML.setStyle(dateText, {
            position: 'fixed',
            top: String(dateAndDayOfWeekVerticalPos + verticalSpacing) + 'px',
            right: String(window.innerWidth - left - columnWidth) + 'px',
            fontSize: dateTextFontSize,
            color: 'var(--shade-3)',
            fontFamily: 'PrimaryBold',
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
        let dayOfWeekText = HTML.getElementUnsafely('day' + String(i) + 'DayOfWeekText');
        if (!exists(dayOfWeekText)) {
            dayOfWeekText = HTML.make('div');
            HTML.setId(dayOfWeekText, 'day' + String(i) + 'DayOfWeekText');
        }
        const dayOfWeekTextFontSize = columnWidth > columnWidthThreshold ? '16px' : '14px';
        HTML.setStyle(dayOfWeekText, {
            position: 'fixed',
            top: String(dateAndDayOfWeekVerticalPos + verticalSpacing) + 'px',
            left: String(left) + 'px',
            fontSize: dayOfWeekTextFontSize,
            color: 'var(--shade-3)',
            fontFamily: 'PrimaryBold',
            zIndex: '400'
        });
        dayOfWeekText.innerHTML = dayOfWeekOrRelativeDay(days[i]);
        if (dayOfWeekOrRelativeDay(days[i]) == 'Today') {
            // white text for today
            HTML.setStyle(dateText, { color: 'var(--shade-4)' });
            HTML.setStyle(dayOfWeekText, { color: 'var(--shade-4)' });
        }
        HTML.body.appendChild(dayOfWeekText);

        renderDay(days[i], i);
    }
}

function renderDividers() {
    // 1. Cleanup old dividers
    let hDivider = HTML.getElementUnsafely('horizontal-divider');
    if (exists(hDivider)) hDivider.remove();
    for (let i = 0; i < 7; i++) { // Max 7 days, so we clean up to 7
        let vDivider = HTML.getElementUnsafely(`vertical-divider-${i}`);
        if (exists(vDivider)) vDivider.remove();
    }

    const numberOfDays = user.settings.numberOfCalendarDays;

    if (user.settings.stacking) {
        // STACKING MODE: Both horizontal and vertical dividers
        
        // Horizontal Divider (only if there are top and bottom rows)
        if (numberOfDays >= 2 && Math.floor(numberOfDays / 2) > 0) {
            hDivider = HTML.make('div');
            HTML.setId(hDivider, 'horizontal-divider');

            const day0Dim = getDayColumnDimensions(0); // A day in the top row
            const hDividerTop = day0Dim.top + day0Dim.height + (gapBetweenColumns / 2) + 2;

            // Determine the horizontal span of all calendar day columns
            let minLeft = Infinity;
            let maxRight = -Infinity;
            for (let i = 0; i < numberOfDays; i++) {
                const dim = getDayColumnDimensions(i);
                minLeft = Math.min(minLeft, dim.left);
                maxRight = Math.max(maxRight, dim.left + dim.width);
            }

            const hDividerLeft = minLeft - (gapBetweenColumns / 2);
            const hDividerWidth = maxRight - minLeft + gapBetweenColumns;
            const hDividerHeight = 2;
            const hDividerBorderRadius = hDividerHeight / 2;

            HTML.setStyle(hDivider, {
                position: 'fixed',
                top: `${hDividerTop}px`,
                left: `${hDividerLeft}px`,
                width: `${hDividerWidth}px`,
                height: `${hDividerHeight}px`,
                backgroundColor: 'var(--shade-2)',
                borderRadius: `${hDividerBorderRadius}px`,
                zIndex: '350'
            });
            HTML.body.appendChild(hDivider);
        }

        // Vertical Dividers for stacking mode
        for (let i = 0; i < numberOfDays; i++) {
            const vDivider = HTML.make('div');
            HTML.setId(vDivider, `vertical-divider-${i}`);

            const dim = getDayColumnDimensions(i);
            const vDividerWidth = 2;
            const vDividerLeft = dim.left - (gapBetweenColumns / 2) - 1; // For 2px width
            const vDividerTop = dim.top - topOfCalendarDay + 6;
            const vDividerHeight = dim.height + topOfCalendarDay - 6;
            const vDividerBorderRadius = vDividerWidth / 2;

            HTML.setStyle(vDivider, {
                position: 'fixed',
                top: `${vDividerTop}px`,
                left: `${vDividerLeft}px`,
                width: `${vDividerWidth}px`,
                height: `${vDividerHeight}px`,
                backgroundColor: 'var(--shade-2)',
                borderRadius: `${vDividerBorderRadius}px`,
                zIndex: '350'
            });
            HTML.body.appendChild(vDivider);
        }
    } else {
        // NON-STACKING MODE: Only vertical dividers
        
        for (let i = 0; i < numberOfDays; i++) {
            const vDivider = HTML.make('div');
            HTML.setId(vDivider, `vertical-divider-${i}`);

            const dim = getDayColumnDimensions(i);
            const vDividerWidth = 2;
            const vDividerLeft = dim.left - (gapBetweenColumns / 2) - 1; // For 2px width
            const vDividerTop = dim.top - topOfCalendarDay + 6;
            const vDividerHeight = dim.height + topOfCalendarDay - 6;
            const vDividerBorderRadius = vDividerWidth / 2;

            HTML.setStyle(vDivider, {
                position: 'fixed',
                top: `${vDividerTop}px`,
                left: `${vDividerLeft}px`,
                width: `${vDividerWidth}px`,
                height: `${vDividerHeight}px`,
                backgroundColor: 'var(--shade-2)',
                borderRadius: `${vDividerBorderRadius}px`,
                zIndex: '350'
            });
            HTML.body.appendChild(vDivider);
        }
    }
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

    let buttonNumberCalendarDays = HTML.getElement('buttonNumberCalendarDays');
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

    let buttonAmPmOr24 = HTML.getElement('buttonAmPmOr24');
    buttonAmPmOr24.innerHTML = 'Toggle 12 Hour or 24 Hour Time';

    const delay = 70; // 0.07 seconds

    const animateTextChange = async (element, newHtml, newStyles = null) => {
        if (!exists(element) || element.innerHTML === newHtml) return;

        const oldText = element.textContent;
        // Deletion
        for (let i = oldText.length; i >= 0; i--) {
            element.textContent = oldText.substring(0, i);
            await new Promise(resolve => setTimeout(resolve, delay));
        }

        // Apply new styles after deletion
        if (newStyles) {
            HTML.setStyle(element, newStyles);
        }

        // Get clean new text for animation
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = newHtml;
        const newText = tempDiv.textContent;

        // Addition
        for (let i = 1; i <= newText.length; i++) {
            element.textContent = newText.substring(0, i);
            await new Promise(resolve => setTimeout(resolve, delay));
        }

        // Restore final HTML
        element.innerHTML = newHtml;
    };

    // update all hour markers
    for (let i = 0; i < user.settings.numberOfCalendarDays; i++) {
        for (let j = 0; j < 24; j++) {
            let hourMarkerText = HTML.getElement(`day${i}hourMarkerText${j}`);
            const newHtml = nthHourText(j);

            let fontSize;
            if (user.settings.ampmOr24 == 'ampm') {
                fontSize = '12px';
            } else {
                fontSize = '10px'; // account for additional colon character
            }
            animateTextChange(hourMarkerText, newHtml, { fontSize: fontSize });
        }
    }

    // Animate task times
    for (let i = 0; i < totalRenderedTaskCount; i++) {
        const line1El = HTML.getElementUnsafely(`task-info-line1-${i}`);
        if (exists(line1El)) {
            const timeData = HTML.getDataUnsafely(line1El, 'timeField');
            if (exists(timeData)) {
                const timeField = new TimeField(timeData.hour, timeData.minute);
                const fontSize = parseFloat(line1El.style.fontSize);
                const color = line1El.style.color || 'var(--shade-3)';
                const newTimeText = formatTaskTime(timeField, fontSize, color);
                animateTextChange(line1El, newTimeText);
            }
        }
        
        const line2El = HTML.getElementUnsafely(`task-info-line2-${i}`);
        if (exists(line2El)) {
            const timeData = HTML.getDataUnsafely(line2El, 'timeField');
            if (exists(timeData)) {
                const timeField = new TimeField(timeData.hour, timeData.minute);
                const fontSize = parseFloat(line2El.style.fontSize);
                const color = line2El.style.color || 'var(--shade-3)';
                const newTimeText = formatTaskTime(timeField, fontSize, color);
                animateTextChange(line2El, newTimeText);
            }
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

let currentMin = NULL;
function renderTimeIndicator(onSchedule) {
    ASSERT(type(onSchedule, Boolean));
    // if render is called it could be for any reason, so we want to update
    // but if this is being called on a schedule (every second), we may not need to update
    if (onSchedule && currentMin != NULL && currentMin == DateTime.local().minute) {
        return;
    }
    currentMin = DateTime.local().minute;

    // 1. Remove existing time indicator elements
    let existingMarker = HTML.getElementUnsafely('time-marker');
    if (exists(existingMarker)) {
        existingMarker.remove();
    }
    let existingTriangle = HTML.getElementUnsafely('time-triangle');
    if (exists(existingTriangle)) {
        existingTriangle.remove();
    }

    // 2. Find if today is being rendered
    const days = currentDays();
    const today = getDayNDaysFromToday(0);
    let todayIndex = -1;
    for (let i = 0; i < days.length; i++) {
        if (days[i].year === today.year && days[i].month === today.month && days[i].day === today.day) {
            todayIndex = i;
            break;
        }
    }

    // 3. If today is not rendered, we are done.
    if (todayIndex === -1) {
        return;
    }

    // 4. Calculate position
    const now = DateTime.local();
    const day = days[todayIndex];
    let dayTime = DateTime.local(day.year, day.month, day.day);

    const startOfVisibleDay = dayTime.startOf('day').plus({ hours: user.settings.startOfDayOffset });
    const endOfVisibleDay = dayTime.endOf('day').plus({ hours: user.settings.endOfDayOffset }).plus({milliseconds: 1});

    const totalDayDuration = endOfVisibleDay.toMillis() - startOfVisibleDay.toMillis();
    const timeSinceStart = now.toMillis() - startOfVisibleDay.toMillis();

    if (timeSinceStart < 0 || timeSinceStart > totalDayDuration) {
        return;
    }

    const timeProportion = timeSinceStart / totalDayDuration;

    const dayColumnDimensions = getDayColumnDimensions(todayIndex);

    // This logic is duplicated from renderDay to correctly calculate the timed area
    let startOfDayUnix = startOfVisibleDay.toMillis();
    let endOfDayUnix = endOfVisibleDay.toMillis();
    let G_filteredAllDayInstances = [];
     for (let entity of user.entityArray) {
        if (type(entity.data, TaskData)) {
             if (entity.data.workSessions.length > 0) { // check length not just > 0
                for (let patternIndex = 0; patternIndex < entity.data.workSessions.length; patternIndex++) {
                    const workSession = entity.data.workSessions[patternIndex];
                    const factoryResults = FilteredInstancesFactory.fromTaskWorkSession(entity, workSession, patternIndex, day, startOfDayUnix, endOfDayUnix);
                    factoryResults.forEach(res => {
                        if (type(res, FilteredAllDayInstance)) G_filteredAllDayInstances.push(res);
                    });
                }
            }
        } else if (type(entity.data, EventData)) {
            for (let patternIndex = 0; patternIndex < entity.data.instances.length; patternIndex++) {
                const eventInst = entity.data.instances[patternIndex];
                const factoryResults = FilteredInstancesFactory.fromEvent(entity, eventInst, patternIndex, day, startOfDayUnix, endOfDayUnix);
                 factoryResults.forEach(res => {
                    if (type(res, FilteredAllDayInstance)) G_filteredAllDayInstances.push(res);
                });
            }
        }
    }

    const totalAllDayEventsHeight = G_filteredAllDayInstances.length * allDayEventHeight + 4;
    const timedEventAreaHeight = dayColumnDimensions.height - totalAllDayEventsHeight;
    const timedEventAreaTop = dayColumnDimensions.top + totalAllDayEventsHeight;

    const positionY = timedEventAreaTop + (timeProportion * timedEventAreaHeight);

    // 5. Create elements
    const timeMarker = HTML.make('div');
    HTML.setId(timeMarker, 'time-marker');
    const timeMarkerHeight = 2;
    HTML.setStyle(timeMarker, {
        position: 'fixed',
        left: String(dayColumnDimensions.left) + 'px',
        width: String(dayColumnDimensions.width) + 'px',
        top: String(positionY) + 'px',
        height: '2px',
        backgroundColor: vibrantRedColor,
        zIndex: String(reminderBaseZIndex + reminderIndexIncreaseOnHover + 1441 + 1), // on top of all reminders
        pointerEvents: 'none',
        opacity: '0.33',
    });
    HTML.body.appendChild(timeMarker);

    const timeTriangle = HTML.make('div');
    HTML.setId(timeTriangle, 'time-triangle');
    const timeTriangleHeight = 16;
    const timeTriangleWidth = 10;
    HTML.setStyle(timeTriangle, {
        position: 'fixed',
        left: String(dayColumnDimensions.left) + 'px',
        top: String(positionY - (timeTriangleHeight / 2) + (timeMarkerHeight / 2)) + 'px',
        width: '0px',
        height: '0px',
        borderLeft: String(timeTriangleWidth) + 'px solid ' + vibrantRedColor,
        borderTop: String(timeTriangleHeight / 2) + 'px solid transparent',
        borderBottom: String(timeTriangleHeight / 2) + 'px solid transparent',
        zIndex: String(reminderBaseZIndex + reminderIndexIncreaseOnHover + 1441 + 2),
        pointerEvents: 'none',
    });
    HTML.body.appendChild(timeTriangle);
}

function renderInputBox() {
    let inputBox = HTML.getElementUnsafely('inputBox');

    if (!exists(inputBox)) {
        inputBox = HTML.make('textarea');
        HTML.setId(inputBox, 'inputBox');
        inputBox.placeholder = "Scribble your tasks and events here...";
        HTML.body.appendChild(inputBox);

        // Create a class to hide the scrollbar
        HTML.createClass('no-scrollbar', {
            'scrollbar-width': 'none' /* For Firefox */
        });
        let styleElement = HTML.make('style');
        styleElement.textContent = `.no-scrollbar::-webkit-scrollbar { display: none; }`; /* For Chrome/Safari */
        HTML.head.appendChild(styleElement);
        inputBox.classList.add('no-scrollbar');

        // Add :focus style to remove outline
        let focusStyle = HTML.make('style');
        focusStyle.textContent = `#inputBox:focus { outline: none; }`;
        HTML.head.appendChild(focusStyle);

        // Animate caret color on focus
        HTML.applyAnimation(
            inputBox,
            'focus',
            [
                { caretColor: '#61a3ff', offset: 0 },
                { caretColor: '#d477ff', offset: 0.5 },
                { caretColor: '#61a3ff', offset: 1 }
            ],
            {
                duration: 3000,
                iterations: Infinity,
                easing: 'ease-in-out'
            }
        );

        // create custom border div via custom background
        let borderDiv = HTML.make('div');
        HTML.setId(borderDiv, 'inputBoxBorder');
        HTML.body.appendChild(borderDiv);

        // Create the rainbow mask container
        const mask = HTML.make('div');
        HTML.setId(mask, 'gradientMask');
        HTML.body.appendChild(mask);

        HTML.setStyle(mask, {
            opacity: '0',
        });

        // Create the rotating circle
        const circle = HTML.make('div');
        HTML.setId(circle, 'gradientCircle');
        HTML.setStyle(circle, {
            borderRadius: '50%',
            background: 'conic-gradient(#4a83ff,#4a83ff,#4a83ff,#c64aff,#4a83ff,#4a83ff,#4a83ff)',
            position: 'absolute',
            animation: 'rainbowRotate 5s linear infinite',
            zIndex: '2'
        });
        mask.appendChild(circle);

        // Add keyframes to stylesheet
        let rainbowStyle = HTML.make('style');
        rainbowStyle.textContent = `
            @keyframes rainbowRotate {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        `;
        HTML.head.appendChild(rainbowStyle);

        // Add focus/blur event listeners for rainbow mask fade animation
        inputBox.addEventListener('focus', function() {
            const gradientMask = HTML.getElementUnsafely('gradientMask');
            if (exists(gradientMask)) {
                gradientMask.style.opacity = '1';
            }
        });

        inputBox.addEventListener('blur', function() {
            const gradientMask = HTML.getElementUnsafely('gradientMask');
            if (exists(gradientMask)) {
                gradientMask.style.opacity = '0';
            }
        });

        // on change, call this function
        inputBox.oninput = () => {
            renderInputBox();
            // this needs to adjust because the amount of space it has may have changed
            renderTaskList();
        };
    }

    // we are rendeing a custom border div, so we add 2px on each side
    const borderThickness = 2;

    let minInputHeight = 70;
    // if column width is less than 100px, set minInputHeight to 10
    if (columnWidth < 180) {
        minInputHeight += (180 - columnWidth);
    }

    // Set styles that may change on resize
    HTML.setStyle(inputBox, {
        position: 'fixed',
        top: String(windowBorderMargin + logoHeight + borderThickness + 6) + 'px', // some padding from bottom of logo
        left: String(windowBorderMargin + borderThickness) + 'px',
        width: String(columnWidth - borderThickness*2) + 'px',
        minHeight: String(minInputHeight) + 'px',
        maxHeight: '500px',
        backgroundColor: 'var(--shade-1)',
        color: 'var(--shade-4)',
        border: 'none',
        borderRadius: '8px',
        padding: '3px 6px',
        resize: 'none',
        fontFamily: 'PrimaryRegular',
        fontSize: '12px',
        whiteSpace: 'pre-wrap',
        boxSizing: 'border-box',
        zIndex: '4'
    });

    // Adjust height based on content
    inputBox.style.height = 'auto';
    inputBox.style.height = `${inputBox.scrollHeight}px`;

    // this is the background border
    let borderDiv = HTML.getElementUnsafely('inputBoxBorder');
    const inputHeight = inputBox.offsetHeight;

    HTML.setStyle(borderDiv, {
        position: 'fixed',
        top: String(windowBorderMargin + logoHeight + 6) + 'px', // some padding from bottom of logo
        left: String(windowBorderMargin) + 'px',
        width: String(columnWidth) + 'px',
        height: String(inputHeight + borderThickness*2) + 'px',
        backgroundColor: 'var(--shade-2)',
        borderRadius: String(7 + borderThickness) + 'px',
        zIndex: '1',
        boxSizing: 'border-box'
    });
    
    const gradientMask = HTML.getElementUnsafely('gradientMask');
    HTML.setStyle(gradientMask, {
        width: String(columnWidth) + 'px',
        height: String(inputHeight + borderThickness*2) + 'px',
        overflow: 'hidden',
        position: 'fixed',
        top: String(windowBorderMargin + logoHeight + 6) + 'px',
        left: String(windowBorderMargin) + 'px',
        zIndex: '3',
        borderRadius: String(7 + borderThickness) + 'px',
        transition: 'opacity 0.2s ease-in-out'
    });

    const circle = HTML.getElementUnsafely('gradientCircle');
    const circleSize = Math.max(inputHeight * 2, columnWidth * 2);
    HTML.setStyle(circle, {
        width: String(circleSize) + 'px',
        height: String(circleSize) + 'px',
        top: String((inputHeight / 2) - (circleSize / 2)) + 'px',
        left: String((columnWidth / 2) - (circleSize / 2)) + 'px',
    });
}

// are there any incomplete tasks in the range?
function hasIncompleteTasksInRange(startUnix, endUnix) {
    ASSERT(type(startUnix, Int));
    ASSERT(type(endUnix, Int));

    for (const entity of user.entityArray) {
        if (type(entity.data, TaskData)) {
            if (!entity.data.isComplete(startUnix, endUnix)) {
                return true;
            }
        }
    }
    return false;
}

function getTasksInRange(startUnix, endUnix) {
    ASSERT(type(startUnix, Int));
    ASSERT(type(endUnix, Int));

    const tasks = [];
    user.entityArray.forEach(entity => {
        if (type(entity.data, TaskData)) {
            entity.data.instances.forEach((instance, instanceIndex) => {
                if (type(instance, NonRecurringTaskInstance)) {
                    let dueDateTime = DateTime.local(instance.date.year, instance.date.month, instance.date.day);
                    if (instance.dueTime !== NULL) {
                        dueDateTime = dueDateTime.set({ hour: instance.dueTime.hour, minute: instance.dueTime.minute });
                    } else {
                        dueDateTime = dueDateTime.endOf('day').minus({ milliseconds: 1 });
                    }
                    const dueUnix = dueDateTime.toMillis();

                    if (dueUnix >= startUnix && dueUnix < endUnix) {
                        tasks.push({
                            id: entity.id,
                            name: entity.name,
                            isComplete: instance.completion,
                            dueDate: dueUnix,
                            instanceIndex: instanceIndex,
                            originalInstance: instance
                        });
                    }
                } else if (type(instance, RecurringTaskInstance)) {
                    const dueTimestamps = generateInstancesFromPattern(instance, startUnix, endUnix);
                    dueTimestamps.forEach(ts => {
                        let finalTimestamp = ts;
                        if (instance.dueTime === NULL) {
                            finalTimestamp = DateTime.fromMillis(ts).endOf('day').minus({ milliseconds: 1 }).toMillis();
                        }

                        const dueDate = DateTime.fromMillis(ts);
                        const dateField = new DateField(dueDate.year, dueDate.month, dueDate.day);
                        
                        const isCompleted = instance.completion.some(completedDate => 
                            completedDate.year === dateField.year &&
                            completedDate.month === dateField.month &&
                            completedDate.day === dateField.day
                        );

                        tasks.push({
                            id: entity.id,
                            name: entity.name,
                            isComplete: isCompleted,
                            dueDate: finalTimestamp,
                            instanceIndex: instanceIndex,
                            originalInstance: instance,
                            recurringDate: dateField, // For completion checking
                        });
                    });
                }
            });
        }
    });

    tasks.sort((a, b) => a.dueDate - b.dueDate);
    return tasks;
}

let totalRenderedTaskCount = 0;

function renderTaskDueDateInfo(task, taskIndex, taskTopPosition, taskListLeft, taskHeight, spaceForTaskDateAndTime) {
    ASSERT(type(task, Object));
    ASSERT(type(taskIndex, Int));
    ASSERT(type(taskTopPosition, Number));
    ASSERT(type(taskListLeft, Number));
    ASSERT(type(taskHeight, Number));
    ASSERT(type(spaceForTaskDateAndTime, Number));

    const now = DateTime.local();
    const dueDate = DateTime.fromMillis(task.dueDate);
    const isOverdue = task.dueDate < now.toMillis() && !task.isComplete;
    const hasTime = task.originalInstance.dueTime !== NULL;

    const isToday = dueDate.hasSame(now, 'day');
    const isTomorrow = dueDate.hasSame(now.plus({ days: 1 }), 'day');

    let line1Text = '';
    let line1FontSize;
    let line2Text = '';
    let line2FontSize;

    // Determine content type and font sizes first
    let line1IsTime = false;
    let line1IsAsterisk = false;
    let line2IsTime = false;

    if (isOverdue) {
        if (isToday) {
            if (hasTime) line1IsTime = true;
        } else {
            if (hasTime) line2IsTime = true;
        }
    } else { // Not overdue
        if (isToday || isTomorrow) {
            if (hasTime) {
                line1IsTime = true;
            } else {
                line1IsAsterisk = true;
            }
        } else { // Week
            if (hasTime) line2IsTime = true;
        }
    }

    if (columnWidth > columnWidthThreshold) {
        line1FontSize = line1IsTime ? taskInfoTimeFontBigCol : (line1IsAsterisk ? taskInfoAsteriskFontBigCol : taskInfoDateFontBigCol);
        line2FontSize = line2IsTime ? taskInfoLineTwoFontBigCol : taskInfoLineTwoFontBigCol; // Assuming line 2 is always smaller text
    } else {
        line1FontSize = line1IsTime ? taskInfoTimeFontSmallCol : (line1IsAsterisk ? taskInfoAsteriskFontSmallCol : taskInfoDateFontSmallCol);
        line2FontSize = line2IsTime ? taskInfoLineTwoFontSmallCol : taskInfoLineTwoFontSmallCol;
    }

    // Now generate the text with the correct font sizes for colons
    if (isOverdue) {
        if (isToday) {
            line1Text = hasTime ? formatTaskTime(task.originalInstance.dueTime, line1FontSize, vibrantRedColor) : "";
        } else {
            line1Text = dueDate.toFormat('M/d');
            if (hasTime) {
                line2Text = formatTaskTime(task.originalInstance.dueTime, line2FontSize, vibrantRedColor);
            }
        }
    } else { // Not overdue
        if (isToday || isTomorrow) {
            if (hasTime) {
                line1Text = formatTaskTime(task.originalInstance.dueTime, line1FontSize, 'var(--shade-3)');
            } else {
                line1Text = '*';
            }
        } else { // Week
            line1Text = dueDate.toFormat('M/d');
            if (hasTime) {
                line2Text = formatTaskTime(task.originalInstance.dueTime, line2FontSize, 'var(--shade-3)');
            }
        }
    }

    const line1Id = `task-info-line1-${taskIndex}`;
    const line2Id = `task-info-line2-${taskIndex}`;
    const textColor = isOverdue ? vibrantRedColor : 'var(--shade-3)';

    let line1El = HTML.getElementUnsafely(line1Id);
    if (line1Text) {
        if (!exists(line1El)) {
            line1El = HTML.make('div');
            HTML.setId(line1El, line1Id);
            HTML.body.appendChild(line1El);
        }
        if (line1IsTime) {
            HTML.setData(line1El, 'timeField', task.originalInstance.dueTime);
        } else {
            HTML.setData(line1El, 'timeField', NULL);
        }
        line1El.innerHTML = line1Text;
        HTML.setStyle(line1El, {
            position: 'fixed',
            color: textColor,
            fontFamily: 'Monospaced',
            zIndex: '3',
            cursor: 'pointer',
            textAlign: 'center',
            fontSize: `${line1FontSize}px`,
            pointerEvents: 'none', // to allow hover on task element underneath
            transition: 'font-size 0.3s ease'
        });
    } else if (exists(line1El)) {
        line1El.remove();
    }
    
    let line2El = HTML.getElementUnsafely(line2Id);
    if (line2Text) {
        if (!exists(line2El)) {
            line2El = HTML.make('div');
            HTML.setId(line2El, line2Id);
            HTML.body.appendChild(line2El);
        }
        if (line2IsTime) {
            HTML.setData(line2El, 'timeField', task.originalInstance.dueTime);
        } else {
            HTML.setData(line2El, 'timeField', NULL);
        }
        line2El.innerHTML = line2Text;
        HTML.setStyle(line2El, {
            position: 'fixed',
            color: textColor,
            fontFamily: 'Monospaced',
            zIndex: '3',
            cursor: 'pointer',
            textAlign: 'center',
            fontSize: `${line2FontSize}px`,
            pointerEvents: 'none',
            transition: 'font-size 0.3s ease'
        });
    } else if (exists(line2El)) {
        line2El.remove();
    }

    const infoAreaWidth = spaceForTaskDateAndTime;
    const infoAreaLeft = taskListLeft;

    if (line1El && line1Text && !line2Text) { // Single line, vertically center
        HTML.setStyle(line1El, {
            top: `${taskTopPosition - 1}px`,
            left: `${infoAreaLeft}px`,
            width: `${infoAreaWidth}px`,
            height: `${taskHeight}px`,
            lineHeight: `${taskHeight}px`
        });
    } else if (line1El && line2El && line1Text && line2Text) { // Two lines
        const totalTextHeight = line1FontSize + line2FontSize;
        const topPadding = (taskHeight - totalTextHeight) / 2;
        HTML.setStyle(line1El, {
            top: `${taskTopPosition + topPadding - 2}px`,
            left: `${infoAreaLeft}px`,
            width: `${infoAreaWidth}px`,
        });
        HTML.setStyle(line2El, {
            top: `${taskTopPosition + topPadding + line1FontSize - 2}px`,
            left: `${infoAreaLeft}px`,
            width: `${infoAreaWidth}px`,
        });
    }

    // Show/hide the elements
    if(line1El) line1El.style.display = 'block';
    if(line2El) line2El.style.display = 'block';
}

function renderTaskListSection(section, index, currentTop, taskListLeft, taskListWidth, sectionHeaderHeight, taskHeight, separatorHeight, numberOfSections) {
    const headerId = `taskListHeader-${section.name}`;
    let headerEl = HTML.getElementUnsafely(headerId);
    if (!exists(headerEl)) {
        headerEl = HTML.make('div');
        HTML.setId(headerEl, headerId);
        HTML.body.appendChild(headerEl);
    }
    headerEl.innerHTML = section.name;
    // Make section header font size responsive
    const sectionFontSize = columnWidth > columnWidthThreshold ? '16px' : '14px';
    HTML.setStyle(headerEl, {
        position: 'fixed',
        top: `${currentTop}px`,
        left: `${taskListLeft}px`,
        width: `${taskListWidth}px`,
        fontFamily: 'PrimaryBold',
        fontSize: sectionFontSize,
        color: section.active ? 'var(--shade-4)' : 'var(--shade-3)',
        transition: 'font-size 0.3s ease'
    });
    currentTop += sectionHeaderHeight;

    const spaceForTaskDateAndTime = columnWidth > columnWidthThreshold ? 36 : 34;

    // Render tasks for the section
    const tasks = getTasksInRange(section.start.toMillis(), section.end.toMillis());
    tasks.forEach(task => {
        const taskTopPosition = currentTop;
        const taskElementId = `task-${totalRenderedTaskCount}`;
        const checkboxElementId = `task-checkbox-${totalRenderedTaskCount}`;
        const overdueStripeElementId = `task-overdue-stripe-${totalRenderedTaskCount}`;
        const hoverElementId = `task-hover-${totalRenderedTaskCount}`;

        // Check if task is overdue and not complete
        const now = DateTime.local();
        const isOverdue = task.dueDate < now.toMillis() && !task.isComplete;

        let taskElement = HTML.getElementUnsafely(taskElementId);
        if (!exists(taskElement)) {
            taskElement = HTML.make('div');
            HTML.setId(taskElement, taskElementId);
            HTML.body.appendChild(taskElement);
        }
        // Show the element (it might have been hidden)
        taskElement.style.display = 'block';

        renderTaskDueDateInfo(task, totalRenderedTaskCount, taskTopPosition, taskListLeft, taskHeight, spaceForTaskDateAndTime);

        let checkboxElement = HTML.getElementUnsafely(checkboxElementId);
        if (!exists(checkboxElement)) {
            checkboxElement = HTML.make('div');
            HTML.setId(checkboxElement, checkboxElementId);
            HTML.body.appendChild(checkboxElement);
            // Add checkbox click functionality only when initially created
            checkboxElement.addEventListener('click', () => toggleCheckbox(checkboxElement));
            HTML.setData(checkboxElement, 'IS_CHECKED', false);
            // Add the checkbox ID to the active set
            activeCheckboxIds.add(checkboxElementId);
        }
        
        // Set task ID, instance index, due date unix time, and section data on checkbox
        HTML.setData(checkboxElement, 'TASK_ID', task.id);
        HTML.setData(checkboxElement, 'INSTANCE_INDEX', task.instanceIndex);
        HTML.setData(checkboxElement, 'DUE_DATE_UNIX', task.dueDate);
        HTML.setData(checkboxElement, 'SECTION', section.name);
        // Show the element (it might have been hidden)
        checkboxElement.style.display = 'block';

        // Create stripe background element for overdue tasks
        let stripeElement = HTML.getElementUnsafely(overdueStripeElementId);
        if (!exists(stripeElement)) {
            stripeElement = HTML.make('div');
            HTML.setId(stripeElement, overdueStripeElementId);
            HTML.body.appendChild(stripeElement);
        }
        // Show the element (it might have been hidden)
        stripeElement.style.display = 'block';

        // Create hover background element
        let hoverElement = HTML.getElementUnsafely(hoverElementId);
        if (!exists(hoverElement)) {
            hoverElement = HTML.make('div');
            HTML.setId(hoverElement, hoverElementId);
            HTML.body.appendChild(hoverElement);
        }
        // Show the element (it might have been hidden)
        hoverElement.style.display = 'block';

        taskElement.innerHTML = task.name;
        // Make task font size responsive
        const taskFontSize = columnWidth > columnWidthThreshold ? '14px' : '12px';
        HTML.setStyle(taskElement, {
            position: 'fixed',
            width: String(taskListWidth) + 'px',
            height: String(taskHeight - 2) + 'px',
            top: String(taskTopPosition) + 'px',
            left: String(taskListLeft) + 'px',
            backgroundColor: 'transparent',
            borderRadius: '3px',
            color: 'var(--shade-4)',
            fontSize: taskFontSize,
            fontFamily: 'PrimaryRegular',
            lineHeight: String(taskHeight - 2) + 'px',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            paddingLeft: String(spaceForTaskDateAndTime) + 'px',
            paddingRight: '16px', // Make space for checkbox
            boxSizing: 'border-box',
            cursor: 'pointer',
            zIndex: '3',
            transition: 'opacity 0.2s ease, font-size 0.3s ease'
        });

        // Make checkbox size responsive
        const checkboxSize = columnWidth > columnWidthThreshold ? 15 : 12;
        // Make checkbox font size responsive
        const checkboxFontSize = columnWidth > columnWidthThreshold ? '12px' : '10px';
        // Make checkbox border thickness responsive
        const checkboxBorderThickness = columnWidth > columnWidthThreshold ? '1.5px' : '1px';
        HTML.setStyle(checkboxElement, {
            position: 'fixed',
            top: String(taskTopPosition + (taskHeight - 2 - checkboxSize) / 2) + 'px',
            left: String(taskListLeft + taskListWidth - checkboxSize - 2) + 'px',
            width: String(checkboxSize) + 'px',
            height: String(checkboxSize) + 'px',
            border: checkboxBorderThickness + ' solid var(--shade-3)',
            borderRadius: '3px',
            backgroundColor: 'transparent',
            cursor: 'pointer',
            boxSizing: 'border-box',
            textAlign: 'center',
            lineHeight: String(checkboxSize) + 'px',
            color: 'var(--shade-3)',
            fontSize: checkboxFontSize,
            zIndex: '3',
            transition: 'opacity 0.2s ease, width 0.3s ease, height 0.3s ease, font-size 0.3s ease, border-width 0.3s ease'
        });

        // Style the hover background element
        HTML.setStyle(hoverElement, {
            position: 'fixed',
            width: String(taskListWidth) + 'px',
            height: String(taskHeight - 2) + 'px',
            top: String(taskTopPosition) + 'px',
            left: String(taskListLeft) + 'px',
            backgroundColor: 'var(--shade-1)',
            borderRadius: '3px',
            zIndex: '1',
            opacity: '0',
            pointerEvents: 'none',
            transition: 'opacity 0.2s ease'
        });

        let stripeWidth = taskListWidth - spaceForTaskDateAndTime + 3;
        let stripeLeft = taskListLeft + spaceForTaskDateAndTime - 3;
        let stripeWidthOnHover = taskListWidth - spaceForTaskDateAndTime + 3;
        let stripeLeftOnHover = taskListLeft + spaceForTaskDateAndTime - 3;

        // Style the striped background for overdue tasks
        if (isOverdue) {
            // Get background color from palette (shade 0) and mix with red (70% background, 30% red)
            // Mix colors
            const redPercentage = 0.35;
            const backgroundPercentage = 1 - redPercentage;
            const backgroundRGB = hexToRgb(user.palette.shades[0]);
            const redRgb = [255, 0, 0];
            const mixedRgb = [
                Math.round(backgroundRGB.r * backgroundPercentage + redRgb[0] * redPercentage),
                Math.round(backgroundRGB.g * backgroundPercentage + redRgb[1] * redPercentage),
                Math.round(backgroundRGB.b * backgroundPercentage + redRgb[2] * redPercentage)
            ];
            const mixedColor = `rgb(${mixedRgb[0]}, ${mixedRgb[1]}, ${mixedRgb[2]})`;
            
            stripeElement.style.transition = 'none';
            
            HTML.setStyle(stripeElement, {
                position: 'fixed',
                width: String(stripeWidth) + 'px',
                height: String(taskHeight - 6) + 'px',
                top: String(taskTopPosition + 2) + 'px',
                left: String(stripeLeft) + 'px',
                backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent 6px, ${mixedColor} 6px, ${mixedColor} 12px)`,
                borderRadius: '3px',
                zIndex: '2',
                cursor: 'pointer',
                opacity: '0.5',
                transition: 'none' // Explicitly set to none during resize
            });

            // Restore transition after the browser has painted the changes
            setTimeout(() => {
                const el = HTML.getElementUnsafely(overdueStripeElementId);
                if (el) {
                    el.style.transition = 'all 0.2s ease';
                }
            }, 0);

        } else {
            HTML.setStyle(stripeElement, {
                display: 'none'
            });
        }
        
        // Hover handlers for all elements
        let count = totalRenderedTaskCount;
        const mouseEnterTask = function() {
            hoverElement.style.opacity = '1';
            const checkboxElement = HTML.getElement(`task-checkbox-${count}`);
            const isChecked = HTML.getData(checkboxElement, 'IS_CHECKED');
            ASSERT(type(isChecked, Boolean));
            if (isChecked) {
                stripeElement.style.opacity = '0';
            } else {
                stripeElement.style.opacity = '1';
            }
            stripeElement.style.width = String(stripeWidthOnHover) + 'px';
            stripeElement.style.height = String(taskHeight - 2) + 'px';
            stripeElement.style.top = String(taskTopPosition) + 'px';
            stripeElement.style.left = String(stripeLeftOnHover) + 'px';
        };
        
        const mouseLeaveTask = function() {
            hoverElement.style.opacity = '0';
            const checkboxElement = HTML.getElement(`task-checkbox-${count}`);
            const isChecked = HTML.getData(checkboxElement, 'IS_CHECKED');
            ASSERT(type(isChecked, Boolean));
            if (isChecked) {
                stripeElement.style.opacity = '0';
            } else {
                stripeElement.style.opacity = '0.5';
            }
            stripeElement.style.width = String(stripeWidth) + 'px';
            stripeElement.style.height = String(taskHeight - 6) + 'px';
            stripeElement.style.top = String(taskTopPosition + 2) + 'px';
            stripeElement.style.left = String(stripeLeft) + 'px';
        };


        
        // Add hover listeners to all elements
        taskElement.addEventListener('mouseenter', mouseEnterTask);
        taskElement.addEventListener('mouseleave', mouseLeaveTask);
        
        checkboxElement.addEventListener('mouseenter', mouseEnterTask);
        checkboxElement.addEventListener('mouseleave', mouseLeaveTask);
        
        if (isOverdue) {
            stripeElement.addEventListener('mouseenter', mouseEnterTask);
            stripeElement.addEventListener('mouseleave', mouseLeaveTask);
        }
        
        currentTop += taskHeight;
        totalRenderedTaskCount++;
    });

    if (index < numberOfSections - 1) {
        const separatorId = `taskListSeparator-${index}`;
        let separatorEl = HTML.getElementUnsafely(separatorId);
        if (!exists(separatorEl)) {
            separatorEl = HTML.make('div');
            HTML.setId(separatorEl, separatorId);
            HTML.body.appendChild(separatorEl);
        }
        HTML.setStyle(separatorEl, {
            position: 'fixed',
            top: `${currentTop}px`,
            left: `${taskListLeft}px`,
            width: `${taskListWidth}px`,
            height: '1px',
            backgroundColor: 'var(--shade-2)'
        });
    }

    currentTop += separatorHeight;

    return currentTop;
}

function renderTaskList() {
    // Instead of removing all elements, we'll hide them first and show/reuse as needed
    for (let i = 0; i < totalRenderedTaskCount; i++) {
        const taskElementId = `task-${i}`;
        const line1Id = `task-info-line1-${i}`;
        const line2Id = `task-info-line2-${i}`;
        const checkboxElementId = `task-checkbox-${i}`;
        const stripeElementId = `task-ovderdue-stripe-${i}`;
        const hoverElementId = `task-hover-${i}`;
        const taskElement = HTML.getElementUnsafely(taskElementId);
        const line1El = HTML.getElementUnsafely(line1Id);
        const line2El = HTML.getElementUnsafely(line2Id);
        const checkboxElement = HTML.getElementUnsafely(checkboxElementId);
        const stripeElement = HTML.getElementUnsafely(stripeElementId);
        const hoverElement = HTML.getElementUnsafely(hoverElementId);
        
        if (taskElement) taskElement.style.display = 'none';
        if (line1El) line1El.style.display = 'none';
        if (line2El) line2El.style.display = 'none';
        if (checkboxElement) checkboxElement.style.display = 'none';
        if (stripeElement) stripeElement.style.display = 'none';
        if (hoverElement) hoverElement.style.display = 'none';
    }

    totalRenderedTaskCount = 0;

    const borderDiv = HTML.getElementUnsafely('inputBoxBorder');

    const taskListTop = parseFloat(borderDiv.style.top) + parseFloat(borderDiv.style.height) + 4;
    const taskListLeft = parseFloat(borderDiv.style.left);
    const taskListWidth = parseFloat(borderDiv.style.width);

    const now = DateTime.local();
    const startOfToday = now.startOf('day');
    const endOfToday = now.endOf('day');
    const startOfTomorrow = startOfToday.plus({ days: 1 });
    const endOfTomorrow = startOfTomorrow.endOf('day');
    const startOfWeek = startOfTomorrow.plus({ days: 1 });
    const endOfWeek = startOfWeek.plus({ days: 6 }).endOf('day');

    const isTodayActive = hasIncompleteTasksInRange(0, endOfToday.toMillis());
    const isTomorrowActive = hasIncompleteTasksInRange(startOfTomorrow.toMillis(), endOfTomorrow.toMillis());
    const isWeekActive = hasIncompleteTasksInRange(startOfWeek.toMillis(), endOfWeek.toMillis());

    let currentTop = taskListTop;
    // Make sectionHeaderHeight responsive based on column width for larger fonts
    const sectionHeaderHeight = columnWidth > columnWidthThreshold ? 22 : 20;
    const separatorHeight = 3;
    // Make taskHeight responsive based on column width
    const taskHeight = columnWidth > columnWidthThreshold ? 22 : 18; // Give more space for larger font

    const sections = [
        { name: 'Today', active: isTodayActive, start: DateTime.fromMillis(0), end: endOfToday },
        { name: 'Tomorrow', active: isTomorrowActive, start: startOfTomorrow, end: endOfTomorrow },
        { name: 'Week', active: isWeekActive, start: startOfWeek, end: endOfWeek }
    ];

    sections.forEach((section, index) => {
        currentTop = renderTaskListSection(section, index, currentTop, taskListLeft, taskListWidth, sectionHeaderHeight, taskHeight, separatorHeight, sections.length);
    });
}

function render() {
    columnWidth = ((window.innerWidth - (2*windowBorderMargin) - gapBetweenColumns*(numberOfColumns() - 1)) / numberOfColumns()); // 1 fewer gaps than columns
    ASSERT(!isNaN(columnWidth), "columnWidth must be a float");
    renderCalendar(currentDays());
    renderDividers();
    renderTimeIndicator(false);
    renderInputBox();
    renderTaskList();
}

window.onresize = render;

async function loadFonts() {
    const fontPromises = fontDefinitions.map(async (fontDef) => {
        let cachedBase64 = preservedFontCss[fontDef.key];
        if (cachedBase64) {
            if (TESTING) {
                // we want the key and url to be what we're looking for
                localStorage.setItem('font' + fontDef.key + fontDef.url, cachedBase64); // Restore after clear
            }
            return cachedBase64;
        } else {
            try {
                const response = await fetch(fontDef.url);
                if (!response.ok) throw new Error(`Failed to fetch font: ${fontDef.key}`);
                
                const fontBlob = await response.blob();
                const base64Font = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result);
                    reader.onerror = reject;
                    reader.readAsDataURL(fontBlob);
                });
                
                localStorage.setItem('font' + fontDef.key + fontDef.url, base64Font);
                return base64Font;

            } catch (error) {
                log('Error loading font:');
                log(error.message);
            }
        }
    });

    const fontData = await Promise.all(fontPromises);

    // Create clean @font-face rules - each font style is its own family
    const fontFaceRules = [];
    const fontFaces = [];
    
    fontDefinitions.forEach((fontDef, index) => {
        const base64Data = fontData[index];
        if (base64Data) {
            fontFaceRules.push(`
                @font-face {
                    font-family: '${fontDef.key}';
                    font-weight: normal;
                    font-style: normal;
                    font-display: swap;
                    src: url('${base64Data}') format('woff2');
                }
            `);
            
            // Create FontFace object for proper loading detection
            const fontFace = new FontFace(fontDef.key, `url('${base64Data}') format('woff2')`);
            fontFaces.push(fontFace);
        }
    });

    if (fontFaceRules.length > 0) {
        const styleElement = HTML.make('style');
        styleElement.textContent = fontFaceRules.join('');
        HTML.head.appendChild(styleElement);
        
        // Load fonts properly and wait for them
        const loadPromises = fontFaces.map(async (fontFace) => {
            try {
                await fontFace.load();
                document.fonts.add(fontFace);
                return true;
            } catch (error) {
                log(`Failed to load font: ${fontFace.family}`);
                return false;
            }
        });
        
        await Promise.all(loadPromises);
    }
}

async function init() {
    await loadFonts();
    render();
    // refresh every second, the function will exit if it isn't a new minute
    setInterval(() => renderTimeIndicator(true), 1000);

    // how fast did the page load and render?
    const loadTime = performance.now();
    log(`Page loaded and rendered in ${Math.round(loadTime)}ms`);
}

init();