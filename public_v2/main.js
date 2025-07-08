// Load LocalData immediately
LocalData.load();

// start loading fonts immediately on page load
const fontDefinitions = [
    // StratfordSerial is the primary font
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

const fontLoadingPromise = loadFonts();

// Global mouse position tracking for robust hover detection
// this is expensive, but it's needed to fix a hover bug until i find a better solution
window.lastMouseX = 0;
window.lastMouseY = 0;
document.addEventListener('mousemove', (e) => {
    window.lastMouseX = e.clientX;
    window.lastMouseY = e.clientY;
});

// Calendar navigation keyboard handlers
document.addEventListener('keydown', (e) => {
    // Don't process arrow keys when user is typing in text inputs
    if (currentlyTyping) return;
    
    if (e.key === 'ArrowLeft') {
        e.preventDefault();
        navigateCalendar('left', e.shiftKey);
    } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        navigateCalendar('right', e.shiftKey);
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        toggleNumberOfCalendarDays(true, e.shiftKey);
    } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        toggleNumberOfCalendarDays(false, e.shiftKey);
    }
});

const SERVER_DOMAIN_ROOT = 'scribblit-production.unrono.workers.dev';
const SERVER_PRODUCTION_DOMAIN = 'app.scribbl.it';
// when testing, use the root domain since the other one doesn't allow this origin
const SERVER_DOMAIN = SERVER_PRODUCTION_DOMAIN;
const PAGES_DOMAIN = 'scribblit2.pages.dev';
const DateTime = luxon.DateTime; // .local() sets the timezone to the user's timezone
let headerButtonSize = 22;
let firstDayInCalendar = NULL; // the first day shown in calendar
let taskListManualHeightAdjustment;
const allDayEventHeight = 18; // height in px for each all-day event
const columnWidthThreshold = 300; // px
const spaceForTaskDateAndTime = 30; // px
const dividerWidth = 3; // px width for both horizontal and vertical dividers
const vibrantRedColor = '#ff4444';
let activeCheckboxIds = new Set();
let STRATEGIES = {
    SINGLE_CHAIN: 'single_chain',
    STEP_BY_STEP: 'step_by_step'
}
let activeStrategy = NULL;

// Save user data to localStorage and server
async function saveUserData(user) {  
    ASSERT(exists(user), "no user passed to saveUserData");
    ASSERT(type(user, User));
    ASSERT(type(LocalData.get('signedIn'), Boolean));
    // ms timestamp
    user.timestamp = Date.now();

    // remove corrupted entities
    // this should never happen, but as a failsafe we sadly throw away the corrupted entities
    let newEntityArray = [];
    for (const entity of user.entityArray) {
        if (type(entity, Entity)) {
            log("WARNING: corrupted entity found, skipping:");
            log(entity);
        } else {
            newEntityArray.push(entity);
        }
    }
    user.entityArray = newEntityArray;

    const userJson = user.encode();
    
    // Always save to localStorage as backup
    localStorage.setItem("userData", JSON.stringify(userJson));
    
    if (LocalData.get('signedIn')) {
        // Send to server
        try {
            const token = LocalData.get('token');
            if (token === NULL) {
                log("ERROR: No token available for server save");
                return;
            }
            
            ASSERT(type(token, String));
            const response = await fetch(`https://${SERVER_DOMAIN}/update-user`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    data: userJson.data,
                    dataspec: userJson.dataspec,
                    timestamp: userJson.timestamp
                })
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                log("ERROR saving user data to server: " + (errorData.error || 'Unknown error'));
                
                // If token is invalid, sign out the user
                if (response.status === 401) {
                    LocalData.set('signedIn', false);
                    LocalData.set('token', NULL);
                    log("Token expired, signed out user");
                    // TODO: show the sign in button
                    // have it slide down from the top of the screen
                }
            } else {
                render();
                log("User data saved to server successfully");
            }
        } catch (error) {
            log("trace: " + error.stack);
            log("ERROR saving user data to server (2): " + error.message);
        }
    }
}

// Load user data from localStorage and server, returns a User object
async function loadUserData() {
    if (LocalData.get('signedIn')) {
        try {
            const token = LocalData.get('token');
            if (token === NULL) {
                log("ERROR: No token available for server load, using local data");
                const userDataLocal = localStorage.getItem("userData");
                if (userDataLocal) {
                    const userJsonLocal = JSON.parse(userDataLocal);
                    return User.decode(userJsonLocal);
                } else {
                    return User.createDefault();
                }
            }

            ASSERT(type(token, String));
            
            // Get local data as fallback
            let userJsonLocal = null;
            const userDataLocal = localStorage.getItem("userData");
            if (userDataLocal) {
                userJsonLocal = JSON.parse(userDataLocal);
            }
            
            // Fetch from server
            try {
                const response = await fetch(`https://${SERVER_DOMAIN}/get-user`, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
                
                if (response.ok) {
                    const serverResponse = await response.json();
                    
                    // Update token if server provided a new one
                    if (serverResponse.token) {
                        LocalData.set('token', serverResponse.token);
                    }
                    
                    // Parse server user data
                    let serverUser = null;
                    if (serverResponse.user) {
                        try {
                            serverUser = User.decode(serverResponse.user);
                        } catch (parseError) {
                            log("ERROR parsing server user data: " + parseError.message);
                            log("serverResponse.user: ");
                            log(serverResponse.user);
                            log("trace: " + parseError.stack);
                            serverUser = null;
                        }
                    }
                    
                    // Add any new local entities to the server user
                    // Take the union, avoid duplicates with same entity id
                    if (serverUser && userJsonLocal) {
                        ASSERT(type(serverUser, User));
                        ASSERT(type(userJsonLocal, Object));
                        
                        // Create a proper merged user without modifying the original serverUser
                        const localUser = User.decode(userJsonLocal);
                        for (const entity of localUser.entityArray) {
                            if (!serverUser.entityArray.some(e => e.id === entity.id)) {
                                serverUser.entityArray.push(entity);
                            }
                        }
                        log("Merged local and server entity arrays");
                        return serverUser;
                    } else if (serverUser) {
                        log("Using server user data (no local data available)");
                        return serverUser;
                    } else if (userJsonLocal) {
                        log("Using local user data (no server data available)");
                        return User.decode(userJsonLocal);
                    } else {
                        log("No user data available, creating default user");
                        return User.createDefault();
                    }
                } else {
                    const errorData = await response.json();
                    log("ERROR fetching user data from server: " + (errorData.error || 'Unknown error'));
                    
                    // If token is invalid, sign out the user
                    if (response.status === 401) {
                        LocalData.set('signedIn', false);
                        LocalData.set('token', NULL);
                        log("Token expired, signed out user");
                        return User.createDefault();
                    }
                    
                    // Use local data as fallback
                    if (userJsonLocal) {
                        log("Using local user data as fallback");
                        return User.decode(userJsonLocal);
                    } else {
                        return User.createDefault();
                    }
                }
            } catch (e) {
                log("ERROR connecting to server: " + e.message);
                
                // Use local data as fallback
                if (userJsonLocal) {
                    log("Using local user data as fallback");
                    return User.decode(userJsonLocal);
                } else {
                    return User.createDefault();
                }
            }
        } catch (error) {
            log("ERROR loading user data: " + error.message);
            return User.createDefault();
        }
    } else {
        // User not signed in, try to load from localStorage or create default
        try {
            const userDataLocal = localStorage.getItem("userData");
            if (userDataLocal) {
                const userJsonLocal = JSON.parse(userDataLocal);
                return User.decode(userJsonLocal);
            }
        } catch (error) {
            log("ERROR parsing local user data: " + error.message);
        }
        return User.createDefault();
    }
}

let userPromise = loadUserData();
let user;

function hexToRgb(hex) {
    ASSERT(type(hex, String));
    ASSERT((hex.startsWith('#') && hex.length === 7 ) || hex.length === 6, "Invalid hex color: " + hex);
    var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    ASSERT(exists(result), "Invalid hex color after parsing: " + hex);
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
    const colonStyle = 'margin-left: 0px; margin-right: 0px; position: relative; top: -0.05em; color: ' + colonColor + '; font-size: ' + fontSize + 'px;';

    if (user.settings.ampmOr24 === '24') {
        return hour.toString() + '<span style="' + colonStyle + '">:</span>' + minute;
    } else { // ampm
        const period = hour >= 12 ? 'PM' : 'AM';
        if (hour > 12) {
            hour -= 12;
        } else if (hour === 0) {
            hour = 12;
        }
        return hour + '<span style="' + colonStyle + '">:</span>' + minute + period;
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

function createFakeEntityArray() {
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
    return [
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

        new Entity(
            'task-543', // id
            '5 instances due in 2 days', // name
            '', // description
            new TaskData( // data
                [
                    new NonRecurringTaskInstance(
                        in2Days, // date
                        NULL, // dueTime
                        false // completion
                    ),
                    new NonRecurringTaskInstance(
                        in2Days, // date
                        NULL, // dueTime
                        false // completion
                    ),
                    new NonRecurringTaskInstance(
                        in2Days, // date
                        NULL, // dueTime
                        false // completion
                    ),
                    new NonRecurringTaskInstance(
                        in2Days, // date
                        NULL, // dueTime
                        false // completion
                    ),
                    new NonRecurringTaskInstance(
                        in2Days, // date
                        NULL, // dueTime
                        false // completion
                    )
                ], // instances
                NULL, // hideUntil
                true, // showOverdue
                [] // workSessions
            ) // data
        ),

        new Entity(
            'task-542', // id
            '5 more instances due in 2 days', // name
            '', // description
            new TaskData( // data
                [
                    new NonRecurringTaskInstance(
                        in2Days, // date
                        NULL, // dueTime
                        false // completion
                    ),
                    new NonRecurringTaskInstance(
                        in2Days, // date
                        NULL, // dueTime
                        false // completion
                    ),
                    new NonRecurringTaskInstance(
                        in2Days, // date
                        NULL, // dueTime
                        false // completion
                    ),
                    new NonRecurringTaskInstance(
                        in2Days, // date
                        NULL, // dueTime
                        false // completion
                    ),
                    new NonRecurringTaskInstance(
                        in2Days, // date
                        NULL, // dueTime
                        false // completion
                    )
                ], // instances
                NULL, // hideUntil
                true, // showOverdue
                [] // workSessions
            ) // data
        ),

        new Entity(
            'task-541', // id
            '5 more more instances due in 2 days', // name
            '', // description
            new TaskData( // data
                [
                    new NonRecurringTaskInstance(
                        in2Days, // date
                        NULL, // dueTime
                        false // completion
                    ),
                    new NonRecurringTaskInstance(
                        in2Days, // date
                        NULL, // dueTime
                        false // completion
                    ),
                    new NonRecurringTaskInstance(
                        in2Days, // date
                        NULL, // dueTime
                        false // completion
                    ),
                    new NonRecurringTaskInstance(
                        in2Days, // date
                        NULL, // dueTime
                        false // completion
                    ),
                    new NonRecurringTaskInstance(
                        in2Days, // date
                        NULL, // dueTime
                        false // completion
                    )
                ], // instances
                NULL, // hideUntil
                true, // showOverdue
                [] // workSessions
            ) // data
        ),

        // task due daily 5 days in row starting in 2 days
        new Entity(
            'task-due-daily-5-days-in-row-starting-in-2-days', // id
            'Due daily 5 times starting in 2 days', // name
            '', // description
            new TaskData( // data
                [
                    new RecurringTaskInstance(
                        new EveryNDaysPattern(
                            in2Days, // initialDate
                            1 // n
                        ), // datePattern
                        new TimeField(10, 0), // dueTime
                        new DateRange(
                            in2Days, // startDate
                            in1Week // endDate
                        ), // range
                        [] // completion
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
            'Call Alex re: Project Super Super Long Long Name',
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
}

// load sample data
if (TESTING) {
    localStorage.clear();
    log("Clean slate");

    // Create user object with the sample data
    let user = new User(
        TESTING_USER_IS_EMPTY ? [] : createFakeEntityArray(),
        {
            ampmOr24: 'ampm',
            startOfDayOffset: 0,
            endOfDayOffset: 0
        },
        palettes.dark,
        NULL,
        NULL,
        0,
        Date.now(),
        "free",
        []
    );
    
    // Store using saveUserData function (async, non-blocking)
    saveUserData(user);
}

function applyPalette(palette) {
    ASSERT(type(palette, Dict(String, List(String))));
    const root = document.documentElement;
    palette.shades.forEach((shade, index) => {
        root.style.setProperty('--shade-' + index, shade);
    });
    palette.accent.forEach((accent, index) => {
        root.style.setProperty('--accent-' + index, accent);
    });
    if (palette.events) {
        palette.events.forEach((color, index) => {
            root.style.setProperty('--event-' + index, color);
    });
    }
}

function addFakeEntitiesToUser() {
    ASSERT(type(user, User));
    ASSERT(LocalData.get('signedIn'), "addFakeEntitiesToUser: user is not signed in");
    user.entityArray.push(...createFakeEntityArray());
    user.timestamp = Date.now();
    saveUserData(user);
}

let gapBetweenColumns = 14;
let windowBorderMargin = 6;
let columnWidth; // portion of screen
let headerSpace = 20; // px gap at top to make space for logo and buttons

const timedEventBaseZIndex = 500;
const reminderBaseZIndex = 3400;
const reminderIndexIncreaseOnHover = 1441; // 1440 minutes in a day, so this way it must be on top of all other reminders
const currentTimeIndicatorZIndex = 5000; // > than 3400+1441
const timeBubbleZIndex = 5001; // above currentTimeIndicatorZIndex
const settingsModalZIndex = 6999;
const settingsButtonZIndex = 7000; // stays above modal
const settingsGearZIndex = 7001; // above settings modal but below settings modal content
const signInModalZIndex = 7002; // above settings modal
const signInButtonZIndex = 7003; // above sign-in modal
const signInTextZIndex = 7004; // above sign-in modal
// ADD: z-index constants for the pro button elements
const proButtonZIndex = 7005; // above sign-in text; below overlay/text
const proOverlayZIndex = 7006; // gradient overlay between background and text
const proTextZIndex = 7007; // highest element in pro button stack

// Calendar navigation functions
function navigateCalendar(direction, shiftHeld = false) {
    ASSERT(type(direction, String));
    ASSERT(direction === 'left' || direction === 'right');
    ASSERT(type(shiftHeld, Boolean));

    // Clean up any hover overlays before navigation
    cleanupAllHoverOverlays();

    // Calculate how many days to shift: 1 day normally, 7 days if shift is held
    const daysToShift = shiftHeld ? 7 : 1;
    
    // Convert current firstDayInCalendar to DateTime for easy manipulation
    let dt = DateTime.local(firstDayInCalendar.year, firstDayInCalendar.month, firstDayInCalendar.day);
    
    // Shift the date range
    if (direction === 'left') {
        // Go back in time
        dt = dt.minus({days: daysToShift});
    } else { // direction === 'right'
        // Go forward in time
        dt = dt.plus({days: daysToShift});
    }
    
    // Update the global firstDayInCalendar
    firstDayInCalendar = new DateField(dt.year, dt.month, dt.day);
    
    // Re-render the calendar with the new date range
    render();
    
    // Restore hover state for element under mouse
    restoreHoverState();
}

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

// Global shift key state management
let G_shiftKeyState = {
    isHeld: false,
    callbacks: []
};

// Global typing state management
let currentlyTyping = false;

// global array for files attached via drag-and-drop
let attachedFiles = [];

let inputBoxDefaultPlaceholder = "Scribble tasks, events, and reminders here...";
// shows when nothing has been typed but there are attached files
let inputBoxPlaceHolderWithAttachedFiles = "You can send a request to the backend by pressing enter, even if you haven't typed anything...";

// the text we are "approaching" with the animation
let goalPlaceholderText = inputBoxDefaultPlaceholder;
let currentlyRunningPlaceholderAnimation = false;
async function updateInputBoxPlaceholder(goalText) {
    ASSERT(type(goalText, String));
    goalPlaceholderText = goalText;

    if (currentlyRunningPlaceholderAnimation) {
        return;
    }
    currentlyRunningPlaceholderAnimation = true;
    
    // change placeholder of input box
    let inputBox = HTML.getElement('inputBox');

    while (inputBox.placeholder !== goalPlaceholderText) {
        if (inputBox.placeholder.length > goalPlaceholderText.length) {
            // remove the last character
            inputBox.placeholder = inputBox.placeholder.substring(0, inputBox.placeholder.length - 1);
        } else if (inputBox.placeholder.length === goalPlaceholderText.length) {
            if (inputBox.placeholder === goalPlaceholderText) {
                break;
            } else {
                // the placeholder text is not the same as the goal text, so remove the last character
                inputBox.placeholder = inputBox.placeholder.substring(0, inputBox.placeholder.length - 1);
            }
        } else {
            if (inputBox.placeholder.length === 0 || inputBox.placeholder.substring(0, inputBox.placeholder.length - 1) === goalPlaceholderText.substring(0, inputBox.placeholder.length - 1)) {
                // add the next character
                inputBox.placeholder = goalPlaceholderText.substring(0, inputBox.placeholder.length + 1);
            } else {
                // keep removing characters until the last character is the same
                inputBox.placeholder = inputBox.placeholder.substring(0, inputBox.placeholder.length - 1);
            }
        }
        await new Promise(resolve => setTimeout(resolve, 15));
    }
    currentlyRunningPlaceholderAnimation = false;
}

function updateAttachmentBadge() {
    const badgeId = 'attachmentBadge';
    const inputBox = HTML.getElementUnsafely('inputBox');
    if (!exists(inputBox)) return;

    let badge = HTML.getElementUnsafely(badgeId);
    if (attachedFiles.length === 0) {
        if (exists(badge)) badge.remove();
        return;
    }

    if (!exists(badge)) {
        badge = HTML.make('div');
        HTML.setId(badge, badgeId);
        HTML.body.appendChild(badge);
        HTML.setStyle(badge, {
            position: 'fixed',
            minWidth: '16px',
            height: '16px',
            padding: '0 4px',
            backgroundColor: 'var(--accent-0)',
            color: 'var(--shade-4)',
            borderRadius: '8px',
            fontFamily: 'PrimaryBold',
            fontSize: '10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: '5',
            pointerEvents: 'none',
            boxSizing: 'border-box'
        });
    }

    badge.textContent = attachedFiles.length;

    const rect = inputBox.getBoundingClientRect();
    const offset = 4;
    badge.style.top = (rect.top - offset) + 'px';
    badge.style.left = (rect.right - badge.offsetWidth + offset) + 'px';
}

function initDragAndDrop() {
    const dropTarget = document.body;

    // TODO: add overlay
    const showOverlay = () => {};
    const hideOverlay = () => {};

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropTarget.addEventListener(eventName, e => {
            e.preventDefault();
            e.stopPropagation();
        }, false);
    });

    document.addEventListener('dragenter', (e) => {
        if (e.dataTransfer?.types?.includes('Files')) {
            dragCounter++;
            showOverlay();
        }
    });

    document.addEventListener('dragleave', (e) => {
        if (e.dataTransfer?.types?.includes('Files')) {
            dragCounter = Math.max(0, dragCounter - 1);
            if (dragCounter === 0) hideOverlay();
        }
    });

    dropTarget.addEventListener('drop', async (e) => {
        const { files } = e.dataTransfer || {};
        if (!files || files.length === 0) {
            hideOverlay();
            dragCounter = 0;
            return;
        }
        for (const file of files) {
            try {
                const base64Data = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result.split(',')[1]);
                    reader.onerror = reject;
                    reader.readAsDataURL(file);
                });
                attachedFiles.push({
                    name: file.name,
                    mimeType: file.type || 'application/octet-stream',
                    data: base64Data,
                    size: file.size
                });
                updateAttachmentBadge();
            } catch (err) {
                console.error('Error reading dropped file:', err);
            }
        }
        hideOverlay();
        dragCounter = 0;
        updateAttachmentBadge();

        if (attachedFiles.length > 0) {
            updateInputBoxPlaceholder(inputBoxPlaceHolderWithAttachedFiles);

            // focus on input box
            HTML.getElement('inputBox').focus();
            
        } else {
            updateInputBoxPlaceholder(inputBoxDefaultPlaceholder);
        }
    });

    window.addEventListener('resize', updateAttachmentBadge);
}

// Global mouse position tracking
let lastMouseX = 0;
let lastMouseY = 0;

// Track mouse position globally
document.addEventListener('mousemove', (e) => {
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
});

// Function to clean up all hover overlay elements
function cleanupAllHoverOverlays() {
    // Clean up all border and text overlays that might be left behind
    for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
        for (let segmentIndex = 0; segmentIndex < 50; segmentIndex++) { // Arbitrary high number
            const borderOverlay = HTML.getElementUnsafely(`day${dayIndex}segment${segmentIndex}_borderOverlay`);
            const textOverlay = HTML.getElementUnsafely(`day${dayIndex}segment${segmentIndex}_textOverlay`);
            
            if (borderOverlay) {
                borderOverlay.remove();
            }
            if (textOverlay) {
                textOverlay.remove();
            }
        }
    }
}

// Function to restore hover state for element under mouse
function restoreHoverState() {
    // Small delay to ensure render is complete
    setTimeout(() => {
        const elementUnderMouse = document.elementFromPoint(lastMouseX, lastMouseY);
        if (elementUnderMouse && elementUnderMouse.id && elementUnderMouse.id.includes('segment')) {
            // Check if this element has a mouse enter handler and trigger it
            if (elementUnderMouse.mouseEnterHandler) {
                elementUnderMouse.mouseEnterHandler();
            }
        }
    }, 10);
}

// Initialize global shift key tracking
function initGlobalShiftKeyTracking() {
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Shift' && !G_shiftKeyState.isHeld) {
            G_shiftKeyState.isHeld = true;
            G_shiftKeyState.callbacks.forEach(callback => callback(true));
        }
    });
    
    document.addEventListener('keyup', (e) => {
        if (e.key === 'Shift' && G_shiftKeyState.isHeld) {
            G_shiftKeyState.isHeld = false;
            G_shiftKeyState.callbacks.forEach(callback => callback(false));
        }
    });
}

function registerShiftKeyCallback(callback) {
    G_shiftKeyState.callbacks.push(callback);
}

// the current days to display
function currentDays() {
    // firstDayInCalendar must be DateField
    if (firstDayInCalendar == NULL) {
        firstDayInCalendar = getDayNDaysFromToday(0);
    }
    ASSERT(type(firstDayInCalendar, DateField));
    // numberOfCalendarDays must be Int between 1 and 7
    ASSERT(type(LocalData.get('numberOfDays'), Int) && LocalData.get('numberOfDays') >= 1 && LocalData.get('numberOfDays') <= 7);
    let days = [];
    for (let i = 0; i < LocalData.get('numberOfDays'); i++) {
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
        ASSERT(exists(element), 'HTML.get element with id ' + id + ' DNE');
        
        // Check if multiple elements share the same ID
        ASSERT(document.querySelectorAll('#' + id).length === 1, 'HTML.get found ' + document.querySelectorAll('#' + id).length + ' elements with id ' + id + ', should be exactly 1');
        
        return element;
    }

    // get but it may not exist
    getElementUnsafely(id) {
        ASSERT(type(id, String));
        
        // If there's an element at all, verify it's the only one
        let element = document.getElementById(id);
        if (exists(element)) {
            ASSERT(document.querySelectorAll('#' + id).length === 1, 'HTML.getUnsafely found ' + document.querySelectorAll('#' + id).length + ' elements with id ' + id + ', should be at most 1');
        }
        
        return element;
    }

    setId(element, id) {
        ASSERT(exists(element) && type(id, String));

        // Check if id is already in use
        // this is part of our interface with the DOM, so regular null is allowed in code
        ASSERT(document.getElementById(id) === null, 'HTML.setId id ' + id + ' is already in use');
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
        ASSERT(exists(element), "HTML.setStyle: element is undefined or null");
        ASSERT(type(styles, Dict(String, String)), "HTML.setStyle: styles is not a dictionary of strings to string");
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
        let existingStyleElement = document.getElementById('style-' + element.id);
        if (exists(existingStyleElement)) {
            existingStyleElement.remove();
        }
        
        // Build CSS string
        let cssRules = '#' + element.id + ':hover {';
        for (let key of Object.keys(styles)) {
            cssRules += key.replace(/([a-z0-9]|(?=[A-Z]))([A-Z])/g, '$1-$2').toLowerCase() + ': ' + styles[key] + '; ';
        }
        cssRules += '}';

        // Create and append style element
        const styleElement = this.make('style');
        this.setId(styleElement, 'style-' + element.id);
        styleElement.textContent = cssRules;
        this.head.appendChild(styleElement);
    }

    hasStyle(element, property) {
        ASSERT(exists(element) && type(property, String));
        return exists(element.style[property]) && element.style[property] !== "";
    }

    getStyle(element, property) {
        ASSERT(exists(element) && type(property, String));
        ASSERT(this.hasStyle(element, property), 'Element does not have property "' + property + '"');
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
    
        let styleString = Object.entries(styles).map(([key, value]) => key + ': ' + value + ';').join('');
    
        styleElement.textContent = '.' + name + ' {' + styleString + '}';
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

function toggleCheckbox(checkboxElement, onlyRendering) {
    let isChecked = HTML.getData(checkboxElement, 'IS_CHECKED');
    ASSERT(type(isChecked, Boolean));
    ASSERT(type(onlyRendering, Boolean));
    
    if (!onlyRendering) {
        isChecked = !isChecked;
        HTML.setData(checkboxElement, 'IS_CHECKED', isChecked);
    }

    if (isChecked) {
        HTML.setStyle(checkboxElement, {
            borderColor: 'var(--shade-2)',
            backgroundColor: 'var(--shade-2)'
        });
    } else {
        HTML.setStyle(checkboxElement, {
            borderColor: 'var(--shade-3)',
            backgroundColor: 'transparent'
        });
    }
    
    // Calculate if task is overdue based on due date first
    const dueDateUnix = HTML.getData(checkboxElement, 'DUE_DATE_UNIX');
    const now = DateTime.local().toMillis();
    const isOverdue = dueDateUnix < now;

    // update the stripe element
    const taskNumber = checkboxElement.id.split('-')[2];
    const stripeElement = HTML.getElementUnsafely('task-overdue-stripe-' + taskNumber);
    if (exists(stripeElement)) {
        if (isChecked) {
            stripeElement.style.opacity = '0';
        } else {
            // Only show stripe if task is actually overdue
            // if we're hovering over task-hover-# then show 1 else show 0.5
            const hoverElement = HTML.getElement('task-hover-' + taskNumber);
            if (hoverElement.style.opacity === '1') {
                stripeElement.style.opacity = '1';
            } else {
                stripeElement.style.opacity = '0.5';
            }
        }
    }

    // update the task text element
    const taskElement = HTML.getElementUnsafely('task-' + taskNumber);
    if (exists(taskElement)) {
        if (isChecked) {
            taskElement.style.color = 'var(--shade-3)';
            taskElement.style.textDecoration = 'line-through';
        } else {
            taskElement.style.color = 'var(--shade-4)';
            taskElement.style.textDecoration = 'none';
        }
    }

    // update the time and date elements if they exist
    const line1Element = HTML.getElementUnsafely('task-info-line1-' + taskNumber);
    if (exists(line1Element)) {
        if (isChecked) {
            // Check if task is currently being hovered
            const hoverElement = HTML.getElementUnsafely('task-hover-' + taskNumber);
            const isHovering = exists(hoverElement) && hoverElement.style.opacity === '0.12';
            line1Element.style.color = isHovering ? 'var(--shade-3)' : 'var(--shade-2)';
        } else {
            // restore original color based on overdue status
            if (isOverdue) {
                line1Element.style.color = vibrantRedColor;
            } else {
                line1Element.style.color = 'var(--shade-3)';
            }
        }
    }

    const line2Element = HTML.getElementUnsafely('task-info-line2-' + taskNumber);
    if (exists(line2Element)) {
        if (isChecked) {
            // Check if task is currently being hovered
            const hoverElement = HTML.getElementUnsafely('task-hover-' + taskNumber);
            const isHovering = exists(hoverElement) && hoverElement.style.opacity === '0.12';
            line2Element.style.color = isHovering ? 'var(--shade-3)' : 'var(--shade-2)';
        } else {
            // restore original color based on overdue status
            if (isOverdue) {
                line2Element.style.color = vibrantRedColor;
            } else {
                line2Element.style.color = 'var(--shade-3)';
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
        // Add transition to colon element if not already present
        if (!colonElement.style.transition) {
            colonElement.style.transition = 'color 0.2s ease';
        }
        if (isChecked) {
            // Check if task is currently being hovered
            const hoverElement = HTML.getElementUnsafely('task-hover-' + taskNumber);
            const isHovering = exists(hoverElement) && hoverElement.style.opacity === '0.12';
            colonElement.style.color = isHovering ? 'var(--shade-3)' : 'var(--shade-2)';
        } else {
            if (isOverdue) {
                colonElement.style.color = vibrantRedColor;
            } else {
                colonElement.style.color = 'var(--shade-3)';
            }
        }
    }

    if (!onlyRendering) {
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
        updateTaskSectionNames(onlyRendering);

        // Save the updated user data
        saveUserData(user);
    }
}

// quick function to know whether a section color should be white for active or grey for inactive
function updateTaskSectionNames(onlyRendering) {
    ASSERT(type(onlyRendering, Boolean), "onlyRendering is not a boolean");
    let activeColor = 'var(--shade-4)';
    let inactiveColor = 'var(--shade-3)';

    // get the task section names
    const taskSectionNameInactive = {"Today" : true, "Tomorrow" : true, "Week" : true};

    // get the curent section status so we can see if one goes from unfinished to finished
    // then we play a confetti animation
    const initiallyActive = {"Today" : true, "Tomorrow" : true, "Week" : true};
    // get the color
    for (const [taskSectionName, _] of Object.entries(taskSectionNameInactive)) {
        const taskSectionElement = HTML.getElement('taskListHeader-' + taskSectionName);
        const taskSectionColor = taskSectionElement.style.color;
        // this 
        if (taskSectionColor === activeColor) {
            initiallyActive[taskSectionName] = true;
        } else {
            initiallyActive[taskSectionName] = false;
        }
    }

    // get all the checkboxes
    for (const id of activeCheckboxIds) {
        const checkboxElement = HTML.getElement(id);
        const isArbitraryBoxChecked = HTML.getData(checkboxElement, 'IS_CHECKED');
        ASSERT(type(isArbitraryBoxChecked, Boolean), "isArbitraryBoxChecked is not a boolean");
        if (!isArbitraryBoxChecked) {
            const taskSectionName = HTML.getData(checkboxElement, 'SECTION');
            taskSectionNameInactive[taskSectionName] = false;
        }
    }

    for (const [taskSectionName, isInactive] of Object.entries(taskSectionNameInactive)) {
        const taskSectionElement = HTML.getElement('taskListHeader-' + taskSectionName);
        if (isInactive) {
            taskSectionElement.style.color = inactiveColor;
        } else {
            taskSectionElement.style.color = activeColor;
        }
    }

    if (!onlyRendering) {
        // see if any of them weren't complete before and are now complete
        for (const [taskSectionName, isInactive] of Object.entries(taskSectionNameInactive)) {
            if (initiallyActive[taskSectionName] && isInactive) {
                // play a confetti animation
                playConfettiAnimation(taskSectionName);
            }
        }
    }
}

let confettiAnimationCurrentlyPlaying = false;
let lastClickedCheckbox = NULL;

function playConfettiAnimation() {
    const checkboxBounds = lastClickedCheckbox.getBoundingClientRect();
    const centerX = checkboxBounds.left + checkboxBounds.width / 2;
    const centerY = checkboxBounds.top + checkboxBounds.height / 2;
    
    for (let i = 0; i < 30; i++) {
        const shape = document.createElement('div');
        const size = (9 + Math.random() * 3);
        const confettiColors = ['#FFCA3A', '#DD2D4A', '#8AC926', '#3772FF'];
        const color = confettiColors[Math.floor(Math.random() * confettiColors.length)];
        
        // Determine shape type based on index: 0-12 circles, 13-26 triangles, 27-39 squares
        const shapeType = i < 13 ? 'circle' : i < 27 ? 'triangle' : 'square';
        
        let shapeStyles = {
            position: 'fixed',
            width: size + 'px',
            height: size + 'px',
            zIndex: '5000',
            pointerEvents: 'none'
        };
        
        if (shapeType === 'circle') {
            shapeStyles.backgroundColor = color;
            shapeStyles.borderRadius = '50%';
        } else if (shapeType === 'triangle') {
            // Create equilateral triangle using CSS borders
            const triangleSize = size * 1.3; // Make triangles 30% bigger
            shapeStyles.width = '0px';
            shapeStyles.height = '0px';
            shapeStyles.borderLeft = (triangleSize/2) + 'px solid transparent';
            shapeStyles.borderRight = (triangleSize/2) + 'px solid transparent';
            shapeStyles.borderBottom = (triangleSize * 0.866) + 'px solid ' + color; // 0.866 ≈ √3/2 for equilateral triangle
        } else { // square
            shapeStyles.backgroundColor = color;
            shapeStyles.borderRadius = '0%';
        }
        
        HTML.setStyle(shape, shapeStyles);
        document.body.appendChild(shape);
        
        // Physics setup
        const angle = -Math.PI / 4 + (Math.random() - 0.5) * (Math.PI / 6);
        const startRadius = Math.random() * 10;
        const velocity = Math.max(400 + Math.random() * 700, 400);
        const duration = 1500 + Math.random() * 1000; // Shorter: 1.5-2.5 seconds
        
        let x = centerX + Math.cos(angle) * startRadius;
        let y = centerY + Math.sin(angle) * startRadius;
        let velX = Math.cos(angle) * velocity;
        let velY = Math.sin(angle) * velocity * 0.75;
        let rotation = 0;
        let rotationX = 0;
        let rotationY = 0;
        let rotationSpeed = Math.random() * 8 + 4; // Slower rotation for paper-like effect
        let rotationXSpeed = Math.random() * 6 + 2; // Random X-axis flipping (slower)
        let rotationYSpeed = Math.random() * 6 + 2; // Random Y-axis flipping (slower)
        
        const friction = Math.max(-0.002756 * window.innerWidth + 3.615 + Math.random() * 0.2, 0.5);
        
        // Pre-calculate all 50 keyframes
        const keyframes = [];
        const numKeyframes = 50;
        
        // Reset physics values for calculation
        let calcX = x;
        let calcY = y;
        let calcVelX = velX;
        let calcVelY = velY;
        let calcRotation = rotation;
        let calcRotationX = rotationX;
        let calcRotationY = rotationY;
        
        for (let frame = 0; frame <= numKeyframes; frame++) {
            const progress = frame / numKeyframes;
            
            // Physics calculations with 3x time step (simulate more physics time per keyframe)
            calcVelY += 490 / 20; // gravity (was /60, now /20 for 3x time step)
            calcVelX *= Math.pow(1 - friction / 60, 3); // friction applied 3x per frame
            calcVelY *= Math.pow(1 - friction / 60, 3); // friction applied 3x per frame
            
            calcX += calcVelX / 20; // position update (was /60, now /20 for 3x time step)
            calcY += calcVelY / 20; // position update (was /60, now /20 for 3x time step)
            calcRotation += rotationSpeed * 3; // rotation 3x faster per keyframe
            calcRotationX += rotationXSpeed * 3; // X-axis flipping
            calcRotationY += rotationYSpeed * 3; // Y-axis flipping
            
            // Fade out
            const opacity = progress > 0.5 ? 1 - ((progress - 0.5) * 2) : 1;
            
            keyframes.push({
                left: calcX + 'px',
                top: calcY + 'px',
                transform: 'translate(-50%, -50%) rotateZ(' + calcRotation + 'deg) rotateX(' + calcRotationX + 'deg) rotateY(' + calcRotationY + 'deg)',
                opacity: String(opacity),
                offset: progress
            });
        }
        
        // Set initial position
        HTML.setStyle(shape, {
            left: x + 'px',
            top: y + 'px',
            transform: 'translate(-50%, -50%) rotateZ(' + rotation + 'deg) rotateX(' + rotationX + 'deg) rotateY(' + rotationY + 'deg)',
            opacity: '1'
        });
        
        // Apply CSS animation using the existing applyAnimation method
        const animationOptions = {
            duration: duration,
            iterations: 1,
            easing: 'linear',
            fill: 'forwards'
        };
        
        // Start animation immediately (no trigger needed)
        const animation = shape.animate(keyframes, animationOptions);
        
        // Remove element when animation finishes
        animation.addEventListener('finish', () => {
            if (document.body.contains(shape)) {
                document.body.removeChild(shape);
            }
        });
    }
}

// how many columns of calendar days plus the task list
function numberOfColumns() {
    ASSERT(type(LocalData.get('stacking'), Boolean) && type(LocalData.get('numberOfDays'), Int));
    if (LocalData.get('stacking')) {
        return Math.floor(LocalData.get('numberOfDays') / 2) + 1;
    }
    return LocalData.get('numberOfDays') + 1;
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
            ASSERT(false, 'Invalid dayOfWeekString: ' + dayOfWeekString);
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
            let searchStartDateTime = currentDateTime.plus({ days: 1 }); // Start searching from the next day to avoid double counting
            
            while (!foundNext && (recurrenceEndDateTime === NULL || searchStartDateTime <= recurrenceEndDateTime)) {
                if (recurrenceEndDateTime !== NULL && searchStartDateTime > recurrenceEndDateTime) {
                    break; // Exceeded end date
                }

                const currentMonthIndex = searchStartDateTime.month - 1; // 0-indexed
                if (!pattern.months[currentMonthIndex]) {
                    // If current month is not active, skip to the next month
                    // Ensure day of month does not cause issues (e.g. Jan 31 to Feb)
                    searchStartDateTime = searchStartDateTime.plus({ months: 1 }).set({ day: 1 });
                    continue;
                }

                // Check if searchStartDateTime's day of week matches pattern.dayOfWeek
                // Luxon's weekday is 1 (Mon) to 7 (Sun)
                const luxonWeekday = searchStartDateTime.weekday;
                const patternWeekdayStr = pattern.dayOfWeek; // 'monday', 'tuesday', etc.
                let patternLuxonWeekday = dayOfWeekStringToIndex(patternWeekdayStr);

                if (luxonWeekday === patternLuxonWeekday) {
                    // It's the correct day of the week, now check if it's the Nth occurrence
                    const dayOfMonth = searchStartDateTime.day;
                    const weekNumberInMonth = Math.ceil(dayOfMonth / 7); // 1st, 2nd, 3rd, 4th, 5th week

                    // Check for last weekday of month (-1)
                    if (type(pattern.nthWeekdays, LAST_WEEK_OF_MONTH)) {
                        const nextSameWeekdayInMonth = searchStartDateTime.plus({ weeks: 1 });
                        if (nextSameWeekdayInMonth.month !== searchStartDateTime.month) { // searchStartDateTime is the last one
                            currentDateTime = searchStartDateTime;
                            foundNext = true;
                        }
                    } else if (type(pattern.nthWeekdays, List(Boolean))) {
                        // Check for specific nth weekdays (1, 2, 3, 4)
                        if (weekNumberInMonth >= 1 && weekNumberInMonth <= 4 && pattern.nthWeekdays[weekNumberInMonth - 1]) {
                            currentDateTime = searchStartDateTime;
                            foundNext = true;
                        }
                    }
                }
                
                if (!foundNext) {
                    searchStartDateTime = searchStartDateTime.plus({ days: 1 }); // Increment day by day to find the next match
                }
                
                if (searchStartDateTime.year > startDateTime.year + 10 && dates.length < 2) { // Prevent excessively long searches if pattern is sparse
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
    
    renderAllDayInstances(G_filteredAllDayInstances, index, columnWidth, originalTop, dayElementLeft, day);
    renderSegmentOfDayInstances(G_filteredSegmentOfDayInstances, index, columnWidth, timedEventAreaTop, timedEventAreaHeight, dayElementLeft, startOfDay, endOfDay);
    renderReminderInstances(G_filteredReminderInstances, index, columnWidth, timedEventAreaTop, timedEventAreaHeight, dayElementLeft, startOfDay, endOfDay);
}

// Renders all-day instances for a given day column.
// If there are fewer all-day events than previously rendered for this day column, 
// the extra DOM elements are removed. For the remaining (or newly created) elements, 
// their content/style is updated to reflect the current all-day instances.
function renderAllDayInstances(allDayInstances, dayIndex, colWidth, dayElementActualTop, dayElemLeft, day) {
    ASSERT(type(allDayInstances, List(FilteredAllDayInstance)));
    ASSERT(type(dayIndex, Int));
    ASSERT(type(colWidth, Number));
    ASSERT(type(dayElementActualTop, Number)); // This is the original top of the day column, before shrinking for all-day items
    ASSERT(type(dayElemLeft, Number));
    ASSERT(type(day, DateField));
    
    // Check if this day is today
    const today = DateTime.local();
    const isToday = day.year === today.year && day.month === today.month && day.day === today.day;

    for (let i = 0; i < allDayInstances.length; i++) {
        let allDayEventData = allDayInstances[i];
        // All-day events are positioned from the dayElementActualTop (original top of the day column)
        let allDayEventTopPosition = dayElementActualTop + (i * allDayEventHeight) + 2;
        
        // Create/Update hover background element
        let hoverElement = HTML.getElementUnsafely(`day${dayIndex}allDayEventHover${i}`);
        if (!exists(hoverElement)) {
            hoverElement = HTML.make('div');
            HTML.setId(hoverElement, `day${dayIndex}allDayEventHover${i}`);
            HTML.body.appendChild(hoverElement);
        }
        
        // Style the hover background element
        HTML.setStyle(hoverElement, {
            position: 'fixed',
            width: String(colWidth) + 'px',
            height: String(allDayEventHeight - 2) + 'px',
            top: String(allDayEventTopPosition) + 'px',
            left: String(dayElemLeft) + 'px',
            backgroundColor: 'var(--shade-4)',
            borderRadius: '3px',
            zIndex: '349',
            opacity: '0',
            pointerEvents: 'none',
            transition: 'opacity 0.2s ease'
        });
        
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
            color: isToday ? 'var(--shade-4)' : 'var(--shade-3)',
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
            transition: 'opacity 0.2s ease, font-size 0.3s ease'
        });
        
        // Add hover effects using event listeners
        allDayEventElement.addEventListener('mouseenter', function() {
            hoverElement.style.opacity = '0.12';
            allDayEventElement.style.color = 'var(--shade-4)';
            if (allDayEventData.ignore) {
                allDayEventElement.style.opacity = '1';
            }
        });
        
        allDayEventElement.addEventListener('mouseleave', function() {
            hoverElement.style.opacity = '0';
            allDayEventElement.style.color = isToday ? 'var(--shade-4)' : 'var(--shade-3)';
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
        
        // Also remove the corresponding hover background element
        let extraHoverElement = HTML.getElementUnsafely(`day${dayIndex}allDayEventHover${existingAllDayEventIndex}`);
        if (exists(extraHoverElement)) {
            extraHoverElement.remove();
        }
        
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
            
            // Set font size immediately to prevent transition from global 200px default
            eventElement.style.fontSize = timedEventFontSize;
            
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
                    
                    // Set font size immediately to prevent transition from global 200px default
                    textOverlay.style.fontSize = timedEventFontSize;
                    
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
                el.style.clipPath = 'polygon(-10% -10%, -10% 110%, 110% 110%)';
            } else {
                // Original position below the line
                el.style.top = `${clampedLineTop + reminderLineHeight}px`;
                const gradientMask = `radial-gradient(circle at bottom right, transparent 0, transparent ${localReminderQuarterCircleRadius}px, black ${localReminderQuarterCircleRadius + 1}px)`;
                el.style.webkitMaskImage = gradientMask;
                el.style.maskImage = gradientMask;
                el.style.webkitMaskPosition = 'bottom right';
                el.style.maskPosition = 'bottom right';
                el.style.clipPath = 'polygon(-10% -10%, 100% -10%, -10% 100%)';
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

    saveUserData(user).catch(error => log("Error saving user data: " + error.message));

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
        const accentColorVar = `var(--accent-${touchingGroupColorIndex % user.palette.accent.length})`;

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
        
        // Check if this day is rightmost
        let isRightmostDay = false;
        if (LocalData.get('stacking')) {
            // In stacking mode, there are two rightmost days: one for top row, one for bottom row
            const topRowRightmost = Math.floor(LocalData.get('numberOfDays') / 2) - 1;
            const bottomRowRightmost = LocalData.get('numberOfDays') - 1;
            isRightmostDay = (dayIndex === topRowRightmost && topRowRightmost >= 0) || (dayIndex === bottomRowRightmost);
        } else {
            // In normal mode, only one rightmost day
            isRightmostDay = (dayIndex === LocalData.get('numberOfDays') - 1);
        }
        
        // Calculate line width - for rightmost days, extend to the right edge of the day column
        let lineWidth;
        if (isRightmostDay) {
            // doesn't extend past event width
            lineWidth = dayElemLeft + colWidth - quarterCircleLeft;
        } else {
            // 1px adjustment to not overlap with the line between days
            lineWidth = dayElemLeft + colWidth + (gapBetweenColumns / 2) - quarterCircleLeft - 1;
        }
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
            clipPath: isFlipped ? 'polygon(-10% -10%, -10% 110%, 110% 110%)' : 'polygon(-10% -10%, 100% -10%, -10% 100%)'
        });

        // Create stacked reminders for groups (initially hidden, positioned relative to container)
        if (isGrouped) {
            for (let stackIndex = 1; stackIndex < group.length; stackIndex++) {
                const stackedReminder = group[stackIndex];
                const stackNumber = group.length - stackIndex; // Count down from top to bottom
                
                // Calculate darkened color using the same accent color as the main reminder
                const darknessFactor = stackIndex * 0.25; // Each level gets 25% more black mixed in
                const accentColorIndex = touchingGroupColorIndex % user.palette.accent.length;
                const accentColorRgb = hexToRgb(user.palette.accent[accentColorIndex]);
                const originalR = accentColorRgb.r;
                const originalG = accentColorRgb.g;
                const originalB = accentColorRgb.b;

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
                        clipPath: 'polygon(-10% -10%, 100% -10%, -10% 100%)'
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
    const numberOfDays = LocalData.get('numberOfDays');
    const isStacking = LocalData.get('stacking');
    ASSERT(type(dayIndex, Int) && dayIndex >= 0 && dayIndex < numberOfDays);

    let height = window.innerHeight - (2 * windowBorderMargin) - headerSpace - topOfCalendarDay;
    let top = windowBorderMargin + headerSpace + topOfCalendarDay;
    let left = windowBorderMargin + ((columnWidth + gapBetweenColumns) * (dayIndex + 1));
    const width = columnWidth; // columnWidth is a global

    if (isStacking) {
        height = (window.innerHeight - headerSpace - (2 * windowBorderMargin) - gapBetweenColumns) / 2 - topOfCalendarDay;
        height -= 1; // manual adjustment, not sure why it's off by 1
        const halfDays = Math.floor(numberOfDays / 2);
        if (dayIndex >= halfDays) { // bottom half
            top += height + gapBetweenColumns + topOfCalendarDay;
            
            if (numberOfDays % 2 == 0) {
                left = windowBorderMargin + ((columnWidth + gapBetweenColumns) * (dayIndex - halfDays + 1));
            } else {
                left = windowBorderMargin + ((columnWidth + gapBetweenColumns) * (dayIndex - halfDays));
            }
        } else { // top half
            left = windowBorderMargin + ((columnWidth + gapBetweenColumns) * (dayIndex + 1));
        }
    }

    return { width, height, top, left };
}

function renderCalendar(days) {
    const numberOfDays = LocalData.get('numberOfDays');
    const isStacking = LocalData.get('stacking');
    
    ASSERT(type(days, List(DateField)));
    ASSERT(exists(numberOfDays) && days.length == numberOfDays, "renderCalendar days must be an array of length LocalData.get('numberOfDays')");
    ASSERT(type(isStacking, Boolean));
    for (let i = 0; i < 7; i++) {
        if (i >= numberOfDays) { // delete excess elements if they exist
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

    const numberOfDays = LocalData.get('numberOfDays');

    if (LocalData.get('stacking')) {
        // STACKING MODE: Both horizontal and vertical dividers
        
        // Horizontal Divider
        // always show in stacking mode because we still have the task list column, so there's always a top and bottom row
        hDivider = HTML.make('div');
        HTML.setId(hDivider, 'horizontal-divider');

        // When numberOfDays is 1, the single day is positioned in the bottom row, 
        // so we need to calculate the divider position differently
        let hDividerTop;
        if (numberOfDays === 1) {
            const topRowHeight = (window.innerHeight - headerSpace - (2 * windowBorderMargin) - gapBetweenColumns) / 2 - topOfCalendarDay;
            hDividerTop = windowBorderMargin + headerSpace + topOfCalendarDay + topRowHeight + (gapBetweenColumns / 2) + 2;
        } else {
            const day0Dim = getDayColumnDimensions(0); // A day in the top row
            hDividerTop = day0Dim.top + day0Dim.height + (gapBetweenColumns / 2) + 2;
        }

        // Determine the horizontal span of all calendar day columns
        let minLeft = Infinity;
        let maxRight = -Infinity;
        for (let i = 0; i < numberOfDays; i++) {
            const dim = getDayColumnDimensions(i);
            minLeft = Math.min(minLeft, dim.left);
            maxRight = Math.max(maxRight, dim.left + dim.width);
        }

        const hDividerLeft = Math.max(minLeft - (gapBetweenColumns / 2), gapBetweenColumns / 2);
        let hDividerWidth;
        if (numberOfDays % 2 == 1) {
            hDividerWidth = maxRight - minLeft;
        } else {
            hDividerWidth = maxRight - minLeft + (gapBetweenColumns / 2) + 1;
        }
        const hDividerHeight = dividerWidth;
        const hDividerBorderRadius = hDividerHeight / 2;

        HTML.setStyle(hDivider, {
            position: 'fixed',
            top: `${hDividerTop}px`,
            left: `${hDividerLeft}px`,
            width: `${hDividerWidth}px`,
            height: `${hDividerHeight}px`,
            backgroundColor: 'var(--shade-2)',
            borderRadius: `${hDividerBorderRadius}px`,
            zIndex: '6300'
        });
        HTML.body.appendChild(hDivider);

        // Vertical Dividers for stacking mode
        for (let i = 0; i < numberOfDays; i++) {
            const vDivider = HTML.make('div');
            HTML.setId(vDivider, `vertical-divider-${i}`);

            // if it's the leftmost column on bottom, skip it
            if (i == Math.floor(numberOfDays / 2)) {
                continue;
            }

            const dim = getDayColumnDimensions(i);
            const vDividerWidth = dividerWidth;
            const vDividerLeft = dim.left - (gapBetweenColumns / 2) - 1;
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
                zIndex: '6300'
            });
            HTML.body.appendChild(vDivider);
        }
    } else {
        // NON-STACKING MODE: Only vertical dividers
        
        for (let i = 0; i < numberOfDays; i++) {
            const vDivider = HTML.make('div');
            HTML.setId(vDivider, `vertical-divider-${i}`);

            const dim = getDayColumnDimensions(i);
            const vDividerWidth = dividerWidth;
            const vDividerLeft = dim.left - (gapBetweenColumns / 2) - 1;
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
                zIndex: '6300'
            });
            HTML.body.appendChild(vDivider);
        }
    }
}

function toggleNumberOfCalendarDays(increment, shiftHeld = false) {
    const currentDays = LocalData.get('numberOfDays');
    ASSERT(type(currentDays, Int));
    ASSERT(1 <= currentDays && currentDays <= 7);
    
    // Clean up any hover overlays before changing days
    cleanupAllHoverOverlays();
    
    let newValue;
    if (shiftHeld) {
        // Shift behavior: go directly to extremes
        if (increment) {
            newValue = 7; // Go to max (7) when shift + top half
        } else {
            newValue = 1; // Go to min (1) when shift + bottom half
        }
    } else {
        // Normal behavior: cycle through values
        if (increment) {
            if (currentDays === 7) {
                newValue = 1;
            } else {
                newValue = currentDays + 1;
            }
        } else {
            if (currentDays === 1) {
                newValue = 7;
            } else {
                newValue = currentDays - 1;
            }
        }
    }

    LocalData.set('numberOfDays', newValue);

    let numberDisplay = HTML.getElement('buttonNumberDisplay');
    numberDisplay.textContent = String(newValue);
    
    // Note: No need to save user data since numberOfDays is LocalData (device-specific)
    render();
    updateTaskListBottomGradient(true); // update the bottom gradient
    
    // Restore hover state for element under mouse
    restoreHoverState();
}

function initNumberOfCalendarDaysButton() {
    // Track hover state for top and bottom halves
    let isHoveringTop = false;
    let isHoveringBottom = false;
    
    // Main button container
    let buttonNumberCalendarDays = HTML.make('div');
    HTML.setId(buttonNumberCalendarDays, 'buttonNumberCalendarDays');
    HTML.setStyle(buttonNumberCalendarDays, {
        position: 'absolute',
        top: '6px',
        right: String(windowBorderMargin + headerButtonSize + 4 + headerButtonSize + 4) + 'px', // Position to the left of stacking button
        width: String(headerButtonSize) + 'px',
        height: String(headerButtonSize) + 'px',
        backgroundColor: 'var(--shade-1)',
        borderRadius: '4px',
        fontSize: '12px',
        color: 'var(--shade-3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        userSelect: 'none',
        cursor: 'pointer'
    });
    
    // Number display
    let numberDisplay = HTML.make('div');
    HTML.setId(numberDisplay, 'buttonNumberDisplay');
    HTML.setStyle(numberDisplay, {
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        fontSize: '14px',
        fontWeight: 'bold',
        fontFamily: 'Monospaced',
        color: 'var(--shade-3)',
        zIndex: '12',
        pointerEvents: 'none'
    });
    
    // Top half (increment)
    let topHalf = HTML.make('div');
    HTML.setId(topHalf, 'buttonTopHalf');
    HTML.setStyle(topHalf, {
        position: 'absolute',
        top: '0',
        left: '0',
        width: '100%',
        height: '50%',
        borderTopLeftRadius: '4px',
        borderTopRightRadius: '4px',
        cursor: 'pointer',
        zIndex: '10',
        transition: 'background-color 0.2s ease'
    });
    
    // Bottom half (decrement)
    let bottomHalf = HTML.make('div');
    HTML.setId(bottomHalf, 'buttonBottomHalf');
    HTML.setStyle(bottomHalf, {
        position: 'absolute',
        bottom: '0',
        left: '0',
        width: '100%',
        height: '50%',
        borderBottomLeftRadius: '4px',
        borderBottomRightRadius: '4px',
        cursor: 'pointer',
        zIndex: '10',
        transition: 'background-color 0.2s ease'
    });
    
    // First up triangle
    let upTriangle1 = HTML.make('div');
    HTML.setId(upTriangle1, 'buttonUpTriangle1');
    HTML.setStyle(upTriangle1, {
        position: 'absolute',
        top: '25%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '0',
        height: '0',
        borderLeft: '3px solid transparent',
        borderRight: '3px solid transparent',
        borderBottom: '4px solid var(--shade-3)',
        opacity: '0',
        transition: 'opacity 0.2s ease, transform 0.2s ease',
        zIndex: '11',
        pointerEvents: 'none'
    });
    
    // Second up triangle
    let upTriangle2 = HTML.make('div');
    HTML.setId(upTriangle2, 'buttonUpTriangle2');
    HTML.setStyle(upTriangle2, {
        position: 'absolute',
        top: '25%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '0',
        height: '0',
        borderLeft: '3px solid transparent',
        borderRight: '3px solid transparent',
        borderBottom: '4px solid var(--shade-3)',
        opacity: '0',
        transition: 'opacity 0.2s ease, transform 0.2s ease',
        zIndex: '11',
        pointerEvents: 'none'
    });
    
    // First down triangle
    let downTriangle1 = HTML.make('div');
    HTML.setId(downTriangle1, 'buttonDownTriangle1');
    HTML.setStyle(downTriangle1, {
        position: 'absolute',
        top: '75%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '0',
        height: '0',
        borderLeft: '3px solid transparent',
        borderRight: '3px solid transparent',
        borderTop: '4px solid var(--shade-3)',
        opacity: '0',
        transition: 'opacity 0.2s ease, transform 0.2s ease',
        zIndex: '11',
        pointerEvents: 'none'
    });
    
    // Second down triangle
    let downTriangle2 = HTML.make('div');
    HTML.setId(downTriangle2, 'buttonDownTriangle2');
    HTML.setStyle(downTriangle2, {
        position: 'absolute',
        top: '75%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '0',
        height: '0',
        borderLeft: '3px solid transparent',
        borderRight: '3px solid transparent',
        borderTop: '4px solid var(--shade-3)',
        opacity: '0',
        transition: 'opacity 0.2s ease, transform 0.2s ease',
        zIndex: '11',
        pointerEvents: 'none'
    });
    
    // Function to update triangle positions based on state
    const updateTopTrianglePositions = () => {
        if (isHoveringTop && G_shiftKeyState.isHeld) {
            // Fast-forward mode: spread triangles apart
            HTML.setStyle(upTriangle1, {
                transform: 'translate(-50%, -50%) translateY(-2px)',
                opacity: '1'
            });
            HTML.setStyle(upTriangle2, {
                transform: 'translate(-50%, -50%) translateY(2px)',
                opacity: '1'
            });
        } else if (isHoveringTop) {
            // Normal hover: triangles together
            HTML.setStyle(upTriangle1, {
                transform: 'translate(-50%, -50%) translateY(0px)',
                opacity: '1'
            });
            HTML.setStyle(upTriangle2, {
                transform: 'translate(-50%, -50%) translateY(0px)',
                opacity: '1'
            });
        } else {
            // Not hovering: hide triangles
            HTML.setStyle(upTriangle1, {
                transform: 'translate(-50%, -50%) translateY(0px)',
                opacity: '0'
            });
            HTML.setStyle(upTriangle2, {
                transform: 'translate(-50%, -50%) translateY(0px)',
                opacity: '0'
            });
        }
    };
    
    const updateBottomTrianglePositions = () => {
        if (isHoveringBottom && G_shiftKeyState.isHeld) {
            // Fast-forward mode: spread triangles apart
            HTML.setStyle(downTriangle1, {
                transform: 'translate(-50%, -50%) translateY(-2px)',
                opacity: '1'
            });
            HTML.setStyle(downTriangle2, {
                transform: 'translate(-50%, -50%) translateY(2px)',
                opacity: '1'
            });
        } else if (isHoveringBottom) {
            // Normal hover: triangles together
            HTML.setStyle(downTriangle1, {
                transform: 'translate(-50%, -50%) translateY(0px)',
                opacity: '1'
            });
            HTML.setStyle(downTriangle2, {
                transform: 'translate(-50%, -50%) translateY(0px)',
                opacity: '1'
            });
        } else {
            // Not hovering: hide triangles
            HTML.setStyle(downTriangle1, {
                transform: 'translate(-50%, -50%) translateY(0px)',
                opacity: '0'
            });
            HTML.setStyle(downTriangle2, {
                transform: 'translate(-50%, -50%) translateY(0px)',
                opacity: '0'
            });
        }
    };
    
    // Register for shift key state changes
    registerShiftKeyCallback((shiftHeld) => {
        updateTopTrianglePositions();
        updateBottomTrianglePositions();
    });
    
    // Event handlers for top half
    topHalf.onclick = (e) => {
        toggleNumberOfCalendarDays(true, e.shiftKey);
    };
    
    topHalf.onmouseenter = () => {
        isHoveringTop = true;
        HTML.setStyle(topHalf, { backgroundColor: 'var(--shade-2)' });
        HTML.setStyle(numberDisplay, { opacity: '0.3' });
        updateTopTrianglePositions();
    };
    
    topHalf.onmouseleave = () => {
        isHoveringTop = false;
        HTML.setStyle(topHalf, { backgroundColor: 'transparent' });
        HTML.setStyle(numberDisplay, { opacity: '1' });
        updateTopTrianglePositions();
    };
    
    // Event handlers for bottom half
    bottomHalf.onclick = (e) => {
        toggleNumberOfCalendarDays(false, e.shiftKey);
    };
    
    bottomHalf.onmouseenter = () => {
        isHoveringBottom = true;
        HTML.setStyle(bottomHalf, { backgroundColor: 'var(--shade-2)' });
        HTML.setStyle(numberDisplay, { opacity: '0.3' });
        updateBottomTrianglePositions();
    };
    
    bottomHalf.onmouseleave = () => {
        isHoveringBottom = false;
        HTML.setStyle(bottomHalf, { backgroundColor: 'transparent' });
        HTML.setStyle(numberDisplay, { opacity: '1' });
        updateBottomTrianglePositions();
    };
    
    // Assemble the button
    buttonNumberCalendarDays.appendChild(numberDisplay);
    buttonNumberCalendarDays.appendChild(topHalf);
    buttonNumberCalendarDays.appendChild(bottomHalf);
    buttonNumberCalendarDays.appendChild(upTriangle1);
    buttonNumberCalendarDays.appendChild(upTriangle2);
    buttonNumberCalendarDays.appendChild(downTriangle1);
    buttonNumberCalendarDays.appendChild(downTriangle2);
    
    HTML.body.appendChild(buttonNumberCalendarDays);
    
    // Initial content update
    numberDisplay.textContent = String(LocalData.get('numberOfDays'));
}

function toggleAmPmOr24(formatSelection) {
    ASSERT(type(user.settings.ampmOr24, String));
    ASSERT(user.settings.ampmOr24 == 'ampm' || user.settings.ampmOr24 == '24');
    ASSERT(formatSelection == '24hr' || formatSelection == 'AM/PM');
    ASSERT(type(formatSelection, String), "toggleAmPmOr24: formatSelection must be a string");
    if (formatSelection === '24hr') {
        user.settings.ampmOr24 = '24';
    } else if (formatSelection === 'AM/PM') {
        user.settings.ampmOr24 = 'ampm';
    } else {
        ASSERT(false, "toggleAmPmOr24: formatSelection must be '24hr' or 'AM/PM'");
    }
    saveUserData(user);

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
    for (let i = 0; i < LocalData.get('numberOfDays'); i++) {
        for (let j = 0; j < 24; j++) {
            let hourMarkerText = HTML.getElement(`day${i}hourMarkerText${j}`);
            const newHtml = nthHourText(j);

            let fontSize;
            if (user.settings.ampmOr24 == 'ampm') {
                fontSize = '12px';
            } else {
                fontSize = '10px'; // account for additional colon character
            }
            
            // Stagger animations with random delays within 0.5 seconds
            const randomDelay = Math.random() * 500; // 0-500ms random delay
            setTimeout(() => {
                animateTextChange(hourMarkerText, newHtml, { fontSize: fontSize });
            }, randomDelay);
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
                
                // Stagger animations with random delays within 0.5 seconds
                const randomDelay = Math.random() * 500; // 0-500ms random delay
                setTimeout(() => {
                    animateTextChange(line1El, newTimeText);
                }, randomDelay);
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
                
                // Stagger animations with random delays within 0.5 seconds
                const randomDelay = Math.random() * 500; // 0-500ms random delay
                setTimeout(() => {
                    animateTextChange(line2El, newTimeText);
                }, randomDelay);
            }
        }
    }
}

function toggleStacking() {
    ASSERT(type(LocalData.get('stacking'), Boolean));
    LocalData.set('stacking', !LocalData.get('stacking'));
    // Note: No need to save user data since stacking is LocalData (device-specific)
    render();
    updateTaskListBottomGradient(true); // update instantly when toggling stacking
}

function initStackingButton() {
    // Stacking button container
    let stackingButton = HTML.make('div');
    HTML.setId(stackingButton, 'stackingButton');
    HTML.setStyle(stackingButton, {
        position: 'absolute',
        top: '6px',
        right: String(windowBorderMargin + headerButtonSize + 4) + 'px', // Position to the left of settings button
        width: String(headerButtonSize) + 'px',
        height: String(headerButtonSize) + 'px',
        backgroundColor: 'var(--shade-1)',
        borderRadius: '4px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        userSelect: 'none',
        cursor: 'pointer',
        transition: 'all 0.3s ease'
    });
    
    // Create stacking icon using CSS - two rectangles representing columns
    let stackingIcon = HTML.make('div');
    HTML.setId(stackingIcon, 'stackingIcon');
    HTML.setStyle(stackingIcon, {
        width: '14px',
        height: '14px',
        position: 'relative',
        transition: 'transform 0.2s ease'
    });
    
    // Create the column rectangles using CSS
    const columnStyle = {
        position: 'absolute',
        border: '1px solid var(--shade-3)',
        borderRadius: '1px',
        boxSizing: 'border-box'
    };
    
    let column1 = HTML.make('div');
    HTML.setStyle(column1, {
        ...columnStyle,
        width: '6px',
        height: '14px',
        left: '0px',
        top: '0px'
    });
    
    let column2 = HTML.make('div');
    HTML.setStyle(column2, {
        ...columnStyle,
        width: '6px',
        height: '14px',
        right: '0px',
        top: '0px'
    });
    
    stackingIcon.appendChild(column1);
    stackingIcon.appendChild(column2);
    
    // Event handlers
    stackingButton.onclick = () => {
        toggleStacking();
        // Rotate icon 90 degrees on click
        const currentRotation = HTML.getData(stackingIcon, 'rotation') || 0;
        const newRotation = currentRotation + 90;
        HTML.setData(stackingIcon, 'rotation', newRotation);
        HTML.setStyle(stackingIcon, {
            transform: `rotate(${newRotation}deg)`
        });
    };
    
    // Hover effect - change background to shade-2
    stackingButton.onmouseenter = () => {
        HTML.setStyle(stackingButton, {
            backgroundColor: 'var(--shade-2)'
        });
    };
    
    stackingButton.onmouseleave = () => {
        HTML.setStyle(stackingButton, {
            backgroundColor: 'var(--shade-1)'
        });
    };
    
    // Set initial rotation based on stacking state
    if (LocalData.get('stacking')) {
        HTML.setData(stackingIcon, 'rotation', 90);
        HTML.setStyle(stackingIcon, {
            transform: 'rotate(90deg)'
        });
    } else {
        HTML.setData(stackingIcon, 'rotation', 0);
    }
    
    // Assemble the button
    stackingButton.appendChild(stackingIcon);
    HTML.body.appendChild(stackingButton);
}

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

    // 5. Create time marker line directly on body
    const timeMarker = HTML.make('div');
    HTML.setId(timeMarker, 'time-marker');
    const timeMarkerHeight = 2;
    
    // Determine if this day is a rightmost day
    const numberOfDays = LocalData.get('numberOfDays');
    const isStacking = LocalData.get('stacking');
    let isRightmostDay = false;
    
    if (isStacking) {
        // In stacking mode, there are two rightmost days (one per row)
        const topRowRightmost = Math.floor(numberOfDays / 2) - 1;
        const bottomRowRightmost = numberOfDays - 1;
        isRightmostDay = (todayIndex === topRowRightmost || todayIndex === bottomRowRightmost);
    } else {
        // In non-stacking mode, only the last day is rightmost
        isRightmostDay = (todayIndex === numberOfDays - 1);
    }
    
    // Extend time marker to divider line if not rightmost day
    const timeMarkerWidth = isRightmostDay ? dayColumnDimensions.width : dayColumnDimensions.width + 7;
    
    HTML.setStyle(timeMarker, {
        position: 'fixed',
        left: String(dayColumnDimensions.left) + 'px',
        width: String(timeMarkerWidth) + 'px',
        top: String(positionY) + 'px',
        height: '2px',
        backgroundColor: vibrantRedColor,
        opacity: '0.33',
        zIndex: String(reminderBaseZIndex + reminderIndexIncreaseOnHover + 1441), // on top of all reminders
        pointerEvents: 'none',
    });
    HTML.body.appendChild(timeMarker);

    // 6. Create time triangle directly on body
    const timeTriangle = HTML.make('div');
    HTML.setId(timeTriangle, 'time-triangle');
    const timeTriangleHeight = 16;
    const timeTriangleWidth = 10;
    HTML.setStyle(timeTriangle, {
        position: 'fixed',
        left: String(dayColumnDimensions.left - 5) + 'px',
        top: String(positionY - (timeTriangleHeight / 2) + (timeMarkerHeight / 2)) + 'px',
        width: '0px',
        height: '0px',
        borderLeft: String(timeTriangleWidth) + 'px solid ' + vibrantRedColor,
        borderTop: String(timeTriangleHeight / 2) + 'px solid transparent',
        borderBottom: String(timeTriangleHeight / 2) + 'px solid transparent',
        zIndex: String(reminderBaseZIndex + reminderIndexIncreaseOnHover + 1441), // on top of all reminders
        pointerEvents: 'none',
    });
    HTML.body.appendChild(timeTriangle);
}

function renderInputBox() {
    let inputBox = HTML.getElementUnsafely('inputBox');

    if (!exists(inputBox)) {
        inputBox = HTML.make('textarea');
        HTML.setId(inputBox, 'inputBox');
        inputBox.placeholder = inputBoxDefaultPlaceholder;
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

        // Animate caret color on focus - will use computed accent colors
        const accent0 = getComputedStyle(document.documentElement).getPropertyValue('--accent-0').trim();
        const accent1 = getComputedStyle(document.documentElement).getPropertyValue('--accent-1').trim();
        HTML.applyAnimation(
            inputBox,
            'focus',
            [
                { caretColor: accent0, offset: 0 },
                { caretColor: accent1, offset: 0.5 },
                { caretColor: accent0, offset: 1 }
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
            background: 'conic-gradient(var(--accent-0),var(--accent-0),var(--accent-0),var(--accent-1),var(--accent-0),var(--accent-0),var(--accent-0))',
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

        // Add focus/blur event listeners for rainbow mask fade animation and typing state
        inputBox.addEventListener('focus', function() {
            const gradientMask = HTML.getElementUnsafely('gradientMask');
            if (exists(gradientMask)) {
                gradientMask.style.opacity = '1';
            }
            currentlyTyping = true;
        });

        inputBox.addEventListener('blur', function() {
            const gradientMask = HTML.getElementUnsafely('gradientMask');
            if (exists(gradientMask)) {
                gradientMask.style.opacity = '0';
            }
            currentlyTyping = false;
        });

        // on change, call this function
        inputBox.oninput = () => {
            renderInputBox();
            // this needs to adjust because the amount of space it has may have changed
            renderTaskList();
        };

        // Add scroll event listener to update gradients
        inputBox.addEventListener('scroll', () => updateInputBoxGradients(false));

        // Add keydown event listener to process input when Enter is pressed
        inputBox.addEventListener('keydown', function(event) {
            if (event.key === 'Enter') {
                event.preventDefault(); // Prevent the default Enter key behavior
                processInput();
            }
        });
    }

    // we are rendeing a custom border div, so we add 2px on each side
    const borderThickness = 2;

    let minInputHeight = 70;
    // if column width is less than 100px, set minInputHeight to 10
    if (columnWidth < 180) {
        minInputHeight += (180 - columnWidth);
    }

    // this is a rough calculation not based on thorough design decisions
    // but it looks fine sooooo I guess it works for now
    let maxHeight;
    if (LocalData.get('stacking')) {
        maxHeight = window.innerHeight / 4;
    } else {
        maxHeight = window.innerHeight / 2;
    }

    // Set styles that may change on resize
    let inputBoxBorderRadius = 8;
    HTML.setStyle(inputBox, {
        position: 'fixed',
        top: String(windowBorderMargin + logoHeight + borderThickness + 6) + 'px', // some padding from bottom of logo
        left: String(windowBorderMargin + borderThickness) + 'px',
        width: String(columnWidth - borderThickness*2) + 'px',
        minHeight: String(minInputHeight) + 'px',
        maxHeight: String(maxHeight) + 'px',
        backgroundColor: 'var(--shade-1)',
        color: 'var(--shade-4)',
        border: 'none',
        borderRadius: String(inputBoxBorderRadius) + 'px',
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
        borderRadius: String(inputBoxBorderRadius + borderThickness) + 'px',
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
        borderRadius: String(inputBoxBorderRadius + borderThickness) + 'px',
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

    // Update input box gradients
    updateInputBoxGradients(false);

    // reposition attachment badge
    updateAttachmentBadge();
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
                        
                        const isCompleted = instance.completion.includes(ts);

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

function renderTaskDueDateInfo(task, taskIndex, taskTopPosition, taskListLeft, taskListTop, taskHeight, spaceForTaskDateAndTime, taskListContainer) {
    ASSERT(type(task, Object));
    ASSERT(type(taskIndex, Int));
    ASSERT(type(taskTopPosition, Number));
    ASSERT(type(taskListLeft, Number));
    ASSERT(type(taskListTop, Number));
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
            taskListContainer.appendChild(line1El);
        }
        if (line1IsTime) {
            HTML.setData(line1El, 'timeField', task.originalInstance.dueTime);
        } else {
            HTML.setData(line1El, 'timeField', NULL);
        }
        line1El.innerHTML = line1Text;
        HTML.setStyle(line1El, {
            position: 'absolute',
            color: textColor,
            fontFamily: 'Monospaced',
            zIndex: '3',
            cursor: 'pointer',
            textAlign: 'center',
            fontSize: `${line1FontSize}px`,
            pointerEvents: 'none', // to allow hover on task element underneath
            transition: 'font-size 0.3s ease, color 0.2s ease'
        });
    } else if (exists(line1El)) {
        line1El.remove();
    }
    
    let line2El = HTML.getElementUnsafely(line2Id);
    if (line2Text) {
        if (!exists(line2El)) {
            line2El = HTML.make('div');
            HTML.setId(line2El, line2Id);
            taskListContainer.appendChild(line2El);
        }
        if (line2IsTime) {
            HTML.setData(line2El, 'timeField', task.originalInstance.dueTime);
        } else {
            HTML.setData(line2El, 'timeField', NULL);
        }
        line2El.innerHTML = line2Text;
        HTML.setStyle(line2El, {
            position: 'absolute',
            color: textColor,
            fontFamily: 'Monospaced',
            zIndex: '3',
            cursor: 'pointer',
            textAlign: 'center',
            fontSize: `${line2FontSize}px`,
            pointerEvents: 'none',
            transition: 'font-size 0.3s ease, color 0.2s ease'
        });
    } else if (exists(line2El)) {
        line2El.remove();
    }

    const infoAreaWidth = spaceForTaskDateAndTime;
    const infoAreaLeft = 0;

    if (line1El && line1Text && !line2Text) { // Single line, vertically center
        HTML.setStyle(line1El, {
            top: `${taskTopPosition - taskListTop - 1}px`,
            left: `${infoAreaLeft}px`,
            width: `${infoAreaWidth}px`,
            height: `${taskHeight}px`,
            lineHeight: `${taskHeight}px`
        });
    } else if (line1El && line2El && line1Text && line2Text) { // Two lines
        const totalTextHeight = line1FontSize + line2FontSize;
        const topPadding = (taskHeight - totalTextHeight) / 2;
        HTML.setStyle(line1El, {
            top: `${taskTopPosition - taskListTop + topPadding - 2}px`,
            left: `${infoAreaLeft}px`,
            width: `${infoAreaWidth}px`,
        });
        HTML.setStyle(line2El, {
            top: `${taskTopPosition - taskListTop + topPadding + line1FontSize - 2}px`,
            left: `${infoAreaLeft}px`,
            width: `${infoAreaWidth}px`,
        });
    }

    // Show/hide the elements
    if(line1El) line1El.style.display = 'block';
    if(line2El) line2El.style.display = 'block';
}

function renderTaskListSection(section, index, currentTop, taskListLeft, taskListTop, taskListWidth, sectionHeaderHeight, taskHeight, separatorHeight, numberOfSections) {
    const taskListContainer = HTML.getElement('taskListContainer');
    const headerId = `taskListHeader-${section.name}`;
    let headerEl = HTML.getElementUnsafely(headerId);
    if (!exists(headerEl)) {
        headerEl = HTML.make('div');
        HTML.setId(headerEl, headerId);
        taskListContainer.appendChild(headerEl);
    }
    headerEl.innerHTML = section.name;
    // Make section header font size responsive
    const sectionFontSize = columnWidth > columnWidthThreshold ? '16px' : '14px';
    HTML.setStyle(headerEl, {
        position: 'absolute',
        top: `${currentTop - taskListTop}px`,
        left: `0px`,
        fontFamily: 'PrimaryBold',
        fontSize: sectionFontSize,
        color: section.active ? 'var(--shade-4)' : 'var(--shade-3)',
        transition: 'font-size 0.3s ease, color 0.2s ease'
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
        // this doesn't mean it's overdue, just that it was due in the past
        const dueInThePast = task.dueDate < now.toMillis();

        let taskElement = HTML.getElementUnsafely(taskElementId);
        if (!exists(taskElement)) {
            taskElement = HTML.make('div');
            HTML.setId(taskElement, taskElementId);
            taskListContainer.appendChild(taskElement);
        }
        // Show the element (it might have been hidden)
        taskElement.style.display = 'block';

        renderTaskDueDateInfo(task, totalRenderedTaskCount, taskTopPosition, taskListLeft, taskListTop, taskHeight, spaceForTaskDateAndTime, taskListContainer);

        let checkboxElement = HTML.getElementUnsafely(checkboxElementId);
        if (!exists(checkboxElement)) {
            checkboxElement = HTML.make('div');
            HTML.setId(checkboxElement, checkboxElementId);
            taskListContainer.appendChild(checkboxElement);
            // Add checkbox click functionality only when initially created
            checkboxElement.addEventListener('click', () => {
                lastClickedCheckbox = checkboxElement;
                toggleCheckbox(checkboxElement, false);
            });
            HTML.setData(checkboxElement, 'IS_CHECKED', task.isComplete);
            // Add the checkbox ID to the active set
            activeCheckboxIds.add(checkboxElementId);
        }
        
        // Set task ID, instance index, due date unix time, and section data on checkbox
        HTML.setData(checkboxElement, 'TASK_ID', task.id);
        HTML.setData(checkboxElement, 'INSTANCE_INDEX', task.instanceIndex);
        HTML.setData(checkboxElement, 'DUE_DATE_UNIX', task.dueDate);
        HTML.setData(checkboxElement, 'SECTION', section.name);
        
        // Update checkbox completion state and apply styling
        HTML.setData(checkboxElement, 'IS_CHECKED', task.isComplete);
        
        // Show the element (it might have been hidden)
        checkboxElement.style.display = 'block';

        // Create stripe background element for overdue tasks
        let stripeElement = HTML.getElementUnsafely(overdueStripeElementId);
        if (!exists(stripeElement)) {
            stripeElement = HTML.make('div');
            HTML.setId(stripeElement, overdueStripeElementId);
            taskListContainer.appendChild(stripeElement);
        }
        // Show the element (it might have been hidden)
        stripeElement.style.display = 'block';

        // Create hover background element
        let hoverElement = HTML.getElementUnsafely(hoverElementId);
        if (!exists(hoverElement)) {
            hoverElement = HTML.make('div');
            HTML.setId(hoverElement, hoverElementId);
            taskListContainer.appendChild(hoverElement);
        }
        // Show the element (it might have been hidden)
        hoverElement.style.display = 'block';

        taskElement.innerHTML = task.name;
        // Make task font size responsive
        const taskFontSize = columnWidth > columnWidthThreshold ? '14px' : '12px';
        HTML.setStyle(taskElement, {
            position: 'absolute',
            width: String(taskListWidth) + 'px',
            height: String(taskHeight - 2) + 'px',
            top: String(taskTopPosition - taskListTop) + 'px',
            left: '0px',
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
            transition: 'opacity 0.2s ease, font-size 0.3s ease, color 0.2s ease'
        });

        // Make checkbox size responsive
        const checkboxSize = columnWidth > columnWidthThreshold ? 15 : 12;
        // Make checkbox font size responsive
        const checkboxFontSize = columnWidth > columnWidthThreshold ? '12px' : '10px';
        // Make checkbox border thickness responsive
        const checkboxBorderThickness = columnWidth > columnWidthThreshold ? '1.5px' : '1px';
        HTML.setStyle(checkboxElement, {
            position: 'absolute',
            top: String(taskTopPosition - taskListTop + (taskHeight - 2 - checkboxSize) / 2) + 'px',
            left: String(taskListWidth - checkboxSize - 2) + 'px',
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
            position: 'absolute',
            width: String(taskListWidth) + 'px',
            height: String(taskHeight - 2) + 'px',
            top: String(taskTopPosition - taskListTop) + 'px',
            left: '0px',
            backgroundColor: 'var(--shade-4)',
            borderRadius: '3px',
            zIndex: '1',
            opacity: '0',
            pointerEvents: 'none',
            transition: 'opacity 0.2s ease'
        });

        let stripeWidth = taskListWidth - spaceForTaskDateAndTime + 3;
        let stripeLeft = spaceForTaskDateAndTime - 3;
        let stripeWidthOnHover = taskListWidth - spaceForTaskDateAndTime + 3;
        let stripeLeftOnHover = spaceForTaskDateAndTime - 3;

        // Style the striped background for overdue tasks
        if (dueInThePast) {
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
            
            const currentOpacity = stripeElement.style.opacity;

            HTML.setStyle(stripeElement, {
                transition: 'none'
            });
            
            HTML.setStyle(stripeElement, {
                position: 'absolute',
                width: String(stripeWidth) + 'px',
                height: String(taskHeight - 6) + 'px',
                top: String(taskTopPosition - taskListTop + 2) + 'px',
                left: String(stripeLeft) + 'px',
                backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent 6px, ${mixedColor} 6px, ${mixedColor} 12px)`,
                borderRadius: '3px',
                zIndex: '2',
                cursor: 'pointer',
                opacity: currentOpacity,
                transition: 'none'
            });

            setTimeout(() => {
                HTML.setStyle(stripeElement, {
                    transition: 'all 0.4s ease'
                });
            }, 50);
        } else {
            HTML.setStyle(stripeElement, {
                display: 'none'
            });
        }
        
        // Apply completion-based styling to checkbox and task elements
        toggleCheckbox(checkboxElement, true);
        
        // Hover handlers for all elements
        let count = totalRenderedTaskCount;
        const mouseEnterTask = function() {
            hoverElement.style.opacity = '0.12';
            const checkboxElement = HTML.getElement(`task-checkbox-${count}`);
            const isChecked = HTML.getData(checkboxElement, 'IS_CHECKED');
            ASSERT(type(isChecked, Boolean));
            if (isChecked) {
                stripeElement.style.opacity = '0';
                
                // Handle hover color for checked tasks' date/time elements
                const line1Element = HTML.getElementUnsafely('task-info-line1-' + count);
                const line2Element = HTML.getElementUnsafely('task-info-line2-' + count);
                if (exists(line1Element)) {
                    line1Element.style.color = 'var(--shade-3)';
                }
                if (exists(line2Element)) {
                    line2Element.style.color = 'var(--shade-3)';
                }
                
                // Handle hover color for checked tasks' colon elements
                let children = NULL;
                if (exists(line1Element) && line1Element.children.length > 0) {
                    children = line1Element.children;
                } else if (exists(line2Element) && line2Element.children.length > 0) {
                    children = line2Element.children;
                }
                if (children !== NULL && children.length === 1) {
                    const colonElement = children[0];
                    colonElement.style.color = 'var(--shade-3)';
                }
            } else {
                stripeElement.style.opacity = '1';
            }
            stripeElement.style.width = String(stripeWidthOnHover) + 'px';
            stripeElement.style.height = String(taskHeight - 2) + 'px';
            stripeElement.style.top = String(taskTopPosition - taskListTop) + 'px';
            stripeElement.style.left = String(stripeLeftOnHover) + 'px';
        };
        
        const mouseLeaveTask = function() {
            hoverElement.style.opacity = '0';
            const checkboxElement = HTML.getElement(`task-checkbox-${count}`);
            const isChecked = HTML.getData(checkboxElement, 'IS_CHECKED');
            ASSERT(type(isChecked, Boolean));
            if (isChecked) {
                stripeElement.style.opacity = '0';
                
                // Restore normal checked color for date/time elements when leaving hover
                const line1Element = HTML.getElementUnsafely('task-info-line1-' + count);
                const line2Element = HTML.getElementUnsafely('task-info-line2-' + count);
                if (exists(line1Element)) {
                    line1Element.style.color = 'var(--shade-2)';
                }
                if (exists(line2Element)) {
                    line2Element.style.color = 'var(--shade-2)';
                }
                
                // Restore normal checked color for colon elements when leaving hover
                let children = NULL;
                if (exists(line1Element) && line1Element.children.length > 0) {
                    children = line1Element.children;
                } else if (exists(line2Element) && line2Element.children.length > 0) {
                    children = line2Element.children;
                }
                if (children !== NULL && children.length === 1) {
                    const colonElement = children[0];
                    colonElement.style.color = 'var(--shade-2)';
                }
            } else {
                stripeElement.style.opacity = '0.5';
            }
            stripeElement.style.width = String(stripeWidth) + 'px';
            stripeElement.style.height = String(taskHeight - 6) + 'px';
            stripeElement.style.top = String(taskTopPosition - taskListTop + 2) + 'px';
            stripeElement.style.left = String(stripeLeft) + 'px';
        };


        
        // Add hover listeners to all elements
        taskElement.addEventListener('mouseenter', mouseEnterTask);
        taskElement.addEventListener('mouseleave', mouseLeaveTask);
        
        checkboxElement.addEventListener('mouseenter', mouseEnterTask);
        checkboxElement.addEventListener('mouseleave', mouseLeaveTask);
        
        if (dueInThePast) {
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
            taskListContainer.appendChild(separatorEl);
        }
        HTML.setStyle(separatorEl, {
            position: 'absolute',
            top: `${currentTop - taskListTop}px`,
            left: `0px`,
            width: `${taskListWidth}px`,
            height: '1px',
            backgroundColor: 'var(--shade-2)'
        });
    }

    currentTop += separatorHeight;

    return currentTop;
}

// Shows / hides accent gradients at the top and bottom of the input box
// whenever the input box is at max height and can scroll.
// "instant" controls whether the opacity transition is animated.
function updateInputBoxGradients(instant) {
    ASSERT(type(instant, Boolean));

    const inputBox = HTML.getElementUnsafely('inputBox');
    if (!exists(inputBox)) return;

    const topGradientId = 'inputBox-top-gradient';
    const bottomGradientId = 'inputBox-bottom-gradient';
    
    let topGradientEl = HTML.getElementUnsafely(topGradientId);
    let bottomGradientEl = HTML.getElementUnsafely(bottomGradientId);
    
    if (!exists(topGradientEl)) {
        topGradientEl = HTML.make('div');
        HTML.setId(topGradientEl, topGradientId);
        HTML.body.appendChild(topGradientEl);
        HTML.setStyle(topGradientEl, {
            opacity: '0',
        });
    }
    
    if (!exists(bottomGradientEl)) {
        bottomGradientEl = HTML.make('div');
        HTML.setId(bottomGradientEl, bottomGradientId);
        HTML.body.appendChild(bottomGradientEl);
        HTML.setStyle(bottomGradientEl, {
            opacity: '0',
        });
    }

    const scrollDistanceThreshold = 10;

    const inputRect = inputBox.getBoundingClientRect();
    const isAtMaxHeight = inputBox.scrollHeight > inputBox.clientHeight;
    
    // Only show if more than scrollDistanceThreshold px scroll distance
    const canScrollUp = inputBox.scrollTop > scrollDistanceThreshold;
    const canScrollDown = inputBox.scrollTop < (inputBox.scrollHeight - inputBox.clientHeight - scrollDistanceThreshold);
    
    const gradientHeight = 20; // px
    
    // Calculate positions - start from input box, not border
    const topGradientTop = inputRect.top;
    const bottomGradientTop = inputRect.bottom - gradientHeight;
    
    // Get the accent color and convert to RGB
    const accentColorHex = getComputedStyle(document.documentElement).getPropertyValue('--accent-0').trim();
    const accentRgb = hexToRgb(accentColorHex);
    
    // Show gradients based on scroll state and max height
    const showTopGradient = isAtMaxHeight && canScrollUp;
    const showBottomGradient = isAtMaxHeight && canScrollDown;
    
    // Style the top gradient
    HTML.setStyle(topGradientEl, {
        position: 'fixed',
        left: String(inputRect.left) + 'px',
        top: String(topGradientTop) + 'px',
        width: String(inputBox.clientWidth) + 'px',
        height: String(gradientHeight) + 'px',
        background: `linear-gradient(to bottom, rgba(${accentRgb.r},${accentRgb.g},${accentRgb.b},0.55) 0%, rgba(${accentRgb.r},${accentRgb.g},${accentRgb.b},0) 100%)`,
        mask: 'linear-gradient(to right, transparent 0%, black 20%, black 80%, transparent 100%)',
        WebkitMask: 'linear-gradient(to right, transparent 0%, black 20%, black 80%, transparent 100%)',
        pointerEvents: 'none',
        zIndex: '5',
        opacity: showTopGradient ? '1' : '0',
        transition: instant ? 'none' : 'opacity 0.3s ease',
        borderRadius: '8px 8px 0 0'
    });
    
    // Style the bottom gradient
    HTML.setStyle(bottomGradientEl, {
        position: 'fixed',
        left: String(inputRect.left) + 'px',
        top: String(bottomGradientTop) + 'px',
        width: String(inputBox.clientWidth) + 'px',
        height: String(gradientHeight) + 'px',
        background: `linear-gradient(to top, rgba(${accentRgb.r},${accentRgb.g},${accentRgb.b},0.55) 0%, rgba(${accentRgb.r},${accentRgb.g},${accentRgb.b},0) 100%)`,
        mask: 'linear-gradient(to right, transparent 0%, black 20%, black 80%, transparent 100%)',
        WebkitMask: 'linear-gradient(to right, transparent 0%, black 20%, black 80%, transparent 100%)',
        pointerEvents: 'none',
        zIndex: '5',
        opacity: showBottomGradient ? '1' : '0',
        transition: instant ? 'none' : 'opacity 0.3s ease',
        borderRadius: '0 0 8px 8px'
    });
}

// Shows / hides an accent gradient at the bottom of the window (or on the horizontal divider
// in stacking mode) whenever the task-list content overflows its viewport.
// "instant" controls whether the opacity transition is animated.
function updateTaskListBottomGradient(instant) {
    ASSERT(type(instant, Boolean));

    ASSERT(type(taskListManualHeightAdjustment, Number));

    const gradientId = 'taskList-bottom-gradient';
    let gradientEl = HTML.getElementUnsafely(gradientId);
    if (!exists(gradientEl)) {
        gradientEl = HTML.make('div');
        HTML.setId(gradientEl, gradientId);
        HTML.body.appendChild(gradientEl);
        HTML.setStyle(gradientEl, {
            opacity: '0',
        });
    }

    const taskListContainer = HTML.getElement('taskListContainer');

    const containerRect = taskListContainer.getBoundingClientRect();
    let showGradient = false;
    let topPos = 0;
    const gradientHeight = 30; // px

    // stacking and there's a horizontal divider
    if (LocalData.get('stacking') && LocalData.get('numberOfDays') % 2 === 1) {
        const hDivider = HTML.getElement('horizontal-divider');
        const hRect = hDivider.getBoundingClientRect();
        topPos = hRect.top - gradientHeight; // center the gradient on the divider
        showGradient = containerRect.bottom > (hRect.bottom - taskListManualHeightAdjustment + 8);
    } else {
        topPos = window.innerHeight - gradientHeight;
        showGradient = containerRect.bottom > (window.innerHeight - taskListManualHeightAdjustment + 10); // 10px manual adjustment
    }

    // Get the accent color and convert to RGB
    const accentColorHex = getComputedStyle(document.documentElement).getPropertyValue('--accent-0').trim();
    const accentRgb = hexToRgb(accentColorHex);
    
    // Style / update the gradient element
    HTML.setStyle(gradientEl, {
        position: 'fixed',
        left: '10px',
        top: String(topPos) + 'px',
        width: String(taskListContainer.clientWidth) + 'px',
        height: String(gradientHeight) + 'px',
        background: `linear-gradient(to top, rgba(${accentRgb.r},${accentRgb.g},${accentRgb.b},0.55) 0%, rgba(${accentRgb.r},${accentRgb.g},${accentRgb.b},0) 100%)`,
        mask: 'linear-gradient(to right, transparent 0%, black 30%, black 70%, transparent 100%)',
        WebkitMask: 'linear-gradient(to right, transparent 0%, black 35%, black 65%, transparent 100%)',
        pointerEvents: 'none',
        zIndex: '5', // below task-list viewport (10) & horizontal divider (350)
        opacity: showGradient ? '1' : '0',
        transition: instant ? 'none' : 'opacity 0.3s ease'
    });
}

function renderTaskList() {
    // Instead of removing all elements, we'll hide them first and show/reuse as needed
    for (let i = 0; i < totalRenderedTaskCount; i++) {
        const taskElementId = `task-${i}`;
        const line1Id = `task-info-line1-${i}`;
        const line2Id = `task-info-line2-${i}`;
        const checkboxElementId = `task-checkbox-${i}`;
        const stripeElementId = `task-overdue-stripe-${i}`;
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

    // Create or update the viewport wrapper
    let taskListViewport = HTML.getElementUnsafely('taskListViewport');
    if (!exists(taskListViewport)) {
        taskListViewport = HTML.make('div');
        HTML.setId(taskListViewport, 'taskListViewport');
        HTML.body.appendChild(taskListViewport);
    }

    // Create or update the task list container div that covers all available space
    let taskListContainer = HTML.getElementUnsafely('taskListContainer');
    if (!exists(taskListContainer)) {
        taskListContainer = HTML.make('div');
        HTML.setId(taskListContainer, 'taskListContainer');
        taskListViewport.appendChild(taskListContainer);
    }

    // Calculate the available height for the task list based on stacking mode
    let taskListHeight;
    if (LocalData.get('stacking')) {
        if (LocalData.get('numberOfDays') % 2 === 0) {
            // In stacking mode with even number of days, extend to bottom of page
            taskListHeight = window.innerHeight - taskListTop; // reach the bottom of the page
        } else {
            // In stacking mode with odd number of days, align with the top row of calendar columns
            // Calculate where the bottom of the top row of calendar columns would be
            const topRowBottom = windowBorderMargin + headerSpace + (window.innerHeight - headerSpace - (2 * windowBorderMargin) - gapBetweenColumns) / 2;
            taskListHeight = topRowBottom - taskListTop;
            taskListHeight += 8; // manual adjustment to match calendar columns
        }
    } else {
        // In non-stacking mode, task list takes full available height
        taskListHeight = window.innerHeight - taskListTop; // reach the bottom of the page
    }

    // Create CSS class for hiding scrollbars if it doesn't exist
    if (!HTML.getElementUnsafely('taskListViewportScrollbarStyle')) {
        const style = HTML.make('style');
        HTML.setId(style, 'taskListViewportScrollbarStyle');
        style.textContent = `
            .taskListViewport-hideScrollbars {
                scrollbar-width: none; /* Firefox */
                -ms-overflow-style: none; /* IE and Edge */
            }
            .taskListViewport-hideScrollbars::-webkit-scrollbar {
                display: none; /* Webkit browsers */
            }
        `;
        HTML.head.appendChild(style);
    }

    HTML.setStyle(taskListViewport, {
        position: 'fixed',
        top: String(taskListTop) + 'px',
        left: String(taskListLeft) + 'px',
        width: String(taskListWidth) + 'px',
        height: String(taskListHeight + 1) + 'px',
        zIndex: '10', // Above other elements to act as a mask
        clipPath: 'polygon(0 0, 100% 0, 100% 100%, 0 100%)', // Mask to hide overflow
        overflow: 'auto', // Make it scrollable
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        justifyContent: 'flex-start'
    });

    // Add the class to hide scrollbars
    taskListViewport.className = 'taskListViewport-hideScrollbars';

    // Add scroll event listener to update gradient
    taskListViewport.addEventListener('scroll', () => updateTaskListBottomGradient(false));

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
        currentTop = renderTaskListSection(section, index, currentTop, taskListLeft, taskListTop, taskListWidth, sectionHeaderHeight, taskHeight, separatorHeight, sections.length);
    });

    // Set container height to actual content height - viewport will handle clipping/scrolling
    const actualContentHeight = currentTop - taskListTop;

    // seemingly does nothing since I made the viewport use flex box.
    if (LocalData.get('stacking')) {
        taskListManualHeightAdjustment = 56;
    } else {
        taskListManualHeightAdjustment = 60;
    }

    HTML.setStyle(taskListContainer, {
        position: 'relative',
        width: '100%',
        height: String(actualContentHeight - taskListManualHeightAdjustment) + 'px'
    });

    // Update task section name colors based on completion status
    updateTaskSectionNames(true);
}

function updateSettingsTextPosition() {
    // Only update if settings modal is open and elements exist
    if (!settingsModalOpen) return;
    
    const settingsModal = HTML.getElementUnsafely('settingsModal');
    if (!exists(settingsModal)) return;
    
    // Get current modal position
    const modalRect = settingsModal.getBoundingClientRect();
    
    // Update settings text position
    const settingsText = HTML.getElementUnsafely('settingsText');
    if (settingsText) {
        HTML.setStyle(settingsText, {
            left: (modalRect.left + 5) + 'px',
            top: (modalRect.top + 5) + 'px'
        });
    }
}

function render() {
    columnWidth = ((window.innerWidth - (2*windowBorderMargin) - gapBetweenColumns*(numberOfColumns() - 1)) / numberOfColumns()); // 1 fewer gaps than columns
    ASSERT(!isNaN(columnWidth), "columnWidth must be a float");
    renderCalendar(currentDays());
    renderDividers();
    renderTimeIndicator(false);
    renderInputBox();
    renderTaskList();
    updateTaskListBottomGradient(false); // fade animation on normal render/resize
    updateInputBoxGradients(false); // update input box gradients on render/resize
    updateSettingsTextPosition(); // update settings text position on render/resize
}

window.onresize = render;

async function init() {
    // Check for OAuth callback parameters
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    const userId = urlParams.get('id');
    const error = urlParams.get('error');
    
    if (error) {
        console.error('OAuth error:', error);
        alert('Sign in failed. Please try again.');
        // Clean up URL
        window.history.replaceState({}, document.title, window.location.pathname);
    } else if (token && userId) {
        // OAuth success - store token and user info
        LocalData.set('token', token);
        LocalData.set('signedIn', true);
        
        // Clean up URL
        window.history.replaceState({}, document.title, window.location.pathname);
        
        // Load user data from server
        try {
            user = await loadUserData();
            if (user) {
                user.userId = userId;
                await saveUserData(user);
                log('Google OAuth sign in successful');
            }
        } catch (error) {
            log('Error loading user data after OAuth: ' + error.message);
        }
    }

    await fontLoadingPromise;
    user = await userPromise;

    applyPalette(user.palette);
    if (firstDayInCalendar == NULL) {
        // Set firstDayInCalendar to today on page load
        firstDayInCalendar = getDayNDaysFromToday(0);
    }
    
    initGridBackground();
    initGlobalShiftKeyTracking();
    initNumberOfCalendarDaysButton();
    initStackingButton();
    initRightNavigationButton();
    initLeftNavigationButton();
    initSettingsButton();
    initSignInButton();
    initProButton();
    initDragAndDrop();
    render();
    // refresh every second, the function will exit if it isn't a new minute
    setInterval(() => renderTimeIndicator(true), 1000);

    // how fast did the page load and render?
    const loadTime = performance.now();
    log(`Initial render in ${Math.round(loadTime)}ms`);
}

// Grid Background with Cursor Fade Effect
function initGridBackground() {
    // Create the grid background element
    const gridBackground = HTML.make('div');
    gridBackground.id = 'grid-background';
    
    // Get accent color 1 and convert to rgba with 0.2 opacity
    const accentColor1Hex = getComputedStyle(document.documentElement).getPropertyValue('--accent-0').trim();
    const accentColor1Rgb = hexToRgb(accentColor1Hex);
    const gridColor = `rgba(${accentColor1Rgb.r}, ${accentColor1Rgb.g}, ${accentColor1Rgb.b}, 0.2)`;
    
    // Add CSS styles for the grid
    // not all of these have js equivalents
    HTML.createClass('grid-background', {
        position: 'fixed',
        top: '0',
        left: '0',
        width: '100vw',
        height: '100vh',
        pointerEvents: 'none',
        zIndex: '-1',
        background: `
            linear-gradient(to right, ${gridColor} 1px, transparent 1px),
            linear-gradient(to bottom, ${gridColor} 1px, transparent 1px)
        `,
        'background-size': '39px 39px',
        'background-position': '20px 20px',
        opacity: '1',
        transition: 'opacity 0.3s ease-in-out'
    });
    
    gridBackground.className = 'grid-background';
    HTML.body.appendChild(gridBackground);
    
    // Track mouse movement to update grid fade position
    let mouseX = window.innerWidth / 2;
    let mouseY = window.innerHeight / 2;
    let mouseInWindow = true;
    let hasMouseMoved = false; // Track if mouse has moved yet
    let vignetteRadius = 2000; // Start with a very large radius (effectively no vignette)
    
    function updateGridMask(x, y, targetRadius = 200) {
        mouseX = x;
        mouseY = y;
        const maskX = (x / window.innerWidth) * 100;
        const maskY = (y / window.innerHeight) * 100;
        
        // Apply the vignette mask with current radius
        gridBackground.style.mask = `radial-gradient(circle ${vignetteRadius}px at ${maskX}% ${maskY}%, black 0%, transparent ${vignetteRadius}px)`;
        gridBackground.style.webkitMask = `radial-gradient(circle ${vignetteRadius}px at ${maskX}% ${maskY}%, black 0%, transparent ${vignetteRadius}px)`;
        
        // Animate radius to target if different
        if (vignetteRadius !== targetRadius) {
            animateVignetteRadius(targetRadius);
        }
    }
    
    function animateVignetteRadius(targetRadius) {
        const startRadius = vignetteRadius;
        const startTime = performance.now();
        const duration = 500; // 500ms animation
        
        function animate(currentTime) {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            // Ease-out animation
            const easeProgress = 1 - Math.pow(1 - progress, 3);
            vignetteRadius = startRadius + (targetRadius - startRadius) * easeProgress;
            
            // Update the mask with current radius
            const maskX = (mouseX / window.innerWidth) * 100;
            const maskY = (mouseY / window.innerHeight) * 100;
            gridBackground.style.mask = `radial-gradient(circle ${vignetteRadius}px at ${maskX}% ${maskY}%, black 0%, transparent ${vignetteRadius}px)`;
            gridBackground.style.webkitMask = `radial-gradient(circle ${vignetteRadius}px at ${maskX}% ${maskY}%, black 0%, transparent ${vignetteRadius}px)`;
            
            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                vignetteRadius = targetRadius;
            }
        }
        
        requestAnimationFrame(animate);
    }
    
    function fadeGridIn() {
        mouseInWindow = true;
        gridBackground.style.opacity = '1';
    }
    
    function fadeGridOut() {
        mouseInWindow = false;
        gridBackground.style.opacity = '0';
    }
    
    // Set initial mask with very large radius (effectively shows all grid)
    updateGridMask(mouseX, mouseY, 2000);
    
    // Add mouse move listener
    document.addEventListener('mousemove', (e) => {
        if (!hasMouseMoved) {
            // First mouse movement - start the vignette effect
            hasMouseMoved = true;
            updateGridMask(e.clientX, e.clientY, 200); // Animate to normal radius
        } else {
            // Just update position, keep current radius
            updateGridMask(e.clientX, e.clientY, vignetteRadius);
        }
    });
    
    // Add mouse enter/leave listeners for window
    document.addEventListener('mouseenter', fadeGridIn);
    document.addEventListener('mouseleave', fadeGridOut);
    
    // Handle window resize
    window.addEventListener('resize', () => {
        if (hasMouseMoved) {
            updateGridMask(mouseX, mouseY, vignetteRadius);
        } else {
            updateGridMask(mouseX, mouseY, 2000);
        }
    });
}

let settingsModalOpen = false;
let settingsModal = null;

let signInModalOpen = false;
let signInModal = null;
let signInModalState = 'initial'; // 'initial', 'email_input', 'verification'

function toggleSettings() {
    if (settingsModalOpen) {
        closeSettingsModal();
    } else {
        openSettingsModal();
    }
}

function openSettingsModal() {
    if (settingsModalOpen || exists(HTML.getElementUnsafely('settingsModal'))) return;
    settingsModalOpen = true;
    
    // Immediately decrease sign-in button and text z-index by 200 each
    // First move background (sign-in button), then move z-index of text
    const signInButton = HTML.getElementUnsafely('signInButton');
    const signInText = HTML.getElementUnsafely('signInText');
    
    if (signInButton) {
        HTML.setStyle(signInButton, {
            zIndex: String(signInButtonZIndex - 200)
        });
    }
    
    if (signInText) {
        HTML.setStyle(signInText, {
            zIndex: String(signInTextZIndex - 200)
        });
    }
    
    // Also move pro button (if present) below the modal
    const proButtonElem = HTML.getElementUnsafely('proButton');
    const proOverlayElem = HTML.getElementUnsafely('proOverlay');
    const proTextElem = HTML.getElementUnsafely('proText');
    
    if (proButtonElem) {
        HTML.setStyle(proButtonElem, {
            zIndex: String(proButtonZIndex - 200)
        });
    }
    if (proOverlayElem) {
        HTML.setStyle(proOverlayElem, {
            zIndex: String(proOverlayZIndex - 200)
        });
    }
    if (proTextElem) {
        HTML.setStyle(proTextElem, {
            zIndex: String(proTextZIndex - 200)
        });
    }
    
    const settingsButton = HTML.getElement('settingsButton');
    const gearIcon = HTML.getElement('gearIcon');
    
    // Get current button position and size
    const buttonRect = settingsButton.getBoundingClientRect();
    const modalWidth = 200;
    let modalHeight;
    if (LocalData.get('signedIn')) {
        modalHeight = 100;
    } else {
        modalHeight = 41;
    }
    
    // Create modal div that starts as the button background
    settingsModal = HTML.make('div');
    HTML.setId(settingsModal, 'settingsModal');
    HTML.setStyle(settingsModal, {
        position: 'fixed',
        top: buttonRect.top + 'px',
        right: (window.innerWidth - buttonRect.right) + 'px',
        width: buttonRect.width + 'px',
        height: buttonRect.height + 'px',
        backgroundColor: 'var(--shade-0)',
        border: '2px solid var(--shade-1)',
        borderRadius: '4px',
        zIndex: String(settingsModalZIndex),
        transformOrigin: 'top right',
        transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)'
    });
    
    HTML.body.appendChild(settingsModal);
    
    // Update gear z-index to be above the modal
    HTML.setStyle(gearIcon, {
        zIndex: String(settingsGearZIndex)
    });
    
    // Force reflow
    settingsModal.offsetHeight;
    
    // Start modal growth animation
    HTML.setStyle(settingsModal, {
        width: modalWidth + 'px',
        height: modalHeight + 'px',
        backgroundColor: 'var(--shade-0)',
        border: '2px solid var(--shade-1)',
        borderRadius: '4px'
    });
    
    // Test the selector after settings animation completes
    setTimeout(() => {
        // state may have changed since the timeout was set
        if (!settingsModalOpen) return;

        // Get modal position for relative positioning
        const modalRect = settingsModal.getBoundingClientRect();
        
        // Create "Settings" title text
        const settingsText = HTML.make('div');
        HTML.setId(settingsText, 'settingsText');
        
        HTML.setStyle(settingsText, {
            position: 'fixed',
            left: (modalRect.left + 5) + 'px',
            top: (modalRect.top + 5) + 'px',
            fontFamily: 'Monospaced',
            fontSize: '12px',
            color: 'var(--shade-4)',
            zIndex: '7002',
            lineHeight: '12px'
        });
        HTML.body.appendChild(settingsText);
        
        // Start the typing animation
        animateSettingsText(settingsText);
        
        // Create time format label
        const timeFormatLabel = HTML.make('div');
        HTML.setId(timeFormatLabel, 'timeFormatLabel');
        timeFormatLabel.textContent = 'Time format:';
        HTML.setStyle(timeFormatLabel, {
            position: 'fixed',
            right: (window.innerWidth - modalRect.left - measureTextWidth("Time format:", 'Monospace', 10) - 5) + 'px',
            top: (modalRect.top + 18) + 'px',
            fontFamily: 'Monospaced',
            fontSize: '10px',
            color: 'var(--shade-4)',
            zIndex: '7002',
            lineHeight: '24px'
        });
        HTML.body.appendChild(timeFormatLabel);
        
        createSelector(
            ['24hr', 'AM/PM'],           // options: array of selectable strings
            'horizontal',                // orientation: layout direction
            'timeFormatSelector',        // id: unique identifier for this selector
            modalRect.width - 145,          // x: 5px from left side of modal
            modalRect.top + 20,          // y: 20px from top of modal
            72,                          // width: total selector width in pixels
            20,                          // height: total selector height in pixels
            7002,                        // zIndex: layer positioning (above settings modal)
            'Monospaced',                 // font: font family for text rendering
            10,                          // fontSize: text size in pixels
            toggleAmPmOr24,              // onSelectionChange: callback function
            user.settings.ampmOr24 === '24' ? '24hr' : 'AM/PM',  // initialSelection: current time format
            0.9,                         // minWaitTime: minimum time between option changes
            'right'                      // alignmentSide: position using left or right
        );

        // Add logout button if user is signed in
        if (LocalData.get('signedIn')) {
            const logoutButton = HTML.make('button');
            HTML.setId(logoutButton, 'logoutButton');
            logoutButton.textContent = 'log out?';
            
            HTML.setStyle(logoutButton, {
                position: 'fixed',
                right: (modalWidth - 55) + 'px',
                top: (modalHeight - 15) + 'px',
                width: '60px',
                height: '20px',
                fontFamily: 'Monospace',
                fontSize: '10px',
                color: 'var(--shade-4)',
                backgroundColor: 'var(--shade-1)',
                border: '1px solid var(--shade-2)',
                borderRadius: '3px',
                cursor: 'pointer',
                transition: 'background-color 0.2s ease, opacity 0.2s ease-in',
                zIndex: '7002'
            });
            
            logoutButton.onclick = () => logout();
            logoutButton.onmouseenter = () => {
                HTML.setStyle(logoutButton, { backgroundColor: 'var(--shade-2)' });
            };
            logoutButton.onmouseleave = () => {
                HTML.setStyle(logoutButton, { backgroundColor: 'var(--shade-1)' });
            };

            const featureRequestButton = HTML.make('button');
            HTML.setId(featureRequestButton, 'featureRequestButton');
            featureRequestButton.textContent = 'request a feature!';
            
            HTML.setStyle(featureRequestButton, {
                position: 'fixed',
                right: '11px',
                top: (modalHeight - 15) + 'px',
                width: '120px',
                height: '20px',
                fontFamily: 'Monospace',
                fontSize: '10px',
                color: 'var(--shade-4)',
                backgroundColor: 'var(--shade-1)',
                border: '1px solid var(--shade-2)',
                borderRadius: '3px',
                cursor: 'pointer',
                transition: 'background-color 0.2s ease, opacity 0.2s ease-in',
                zIndex: '7002'
            });
            
            featureRequestButton.onmouseenter = () => {
                HTML.setStyle(featureRequestButton, { backgroundColor: 'var(--shade-2)' });
            };
            featureRequestButton.onmouseleave = () => {
                HTML.setStyle(featureRequestButton, { backgroundColor: 'var(--shade-1)' });
            };

            featureRequestButton.onclick = () => {
                const settingsText = HTML.getElement('settingsText');
                const timeFormatLabel = HTML.getElement('timeFormatLabel');
                const logoutButton = HTML.getElement('logoutButton');
                
                // Start animations immediately
                deleteSelector('timeFormatSelector');
                HTML.setStyle(settingsText, { opacity: '0' });
                HTML.setStyle(timeFormatLabel, { opacity: '0' });
                HTML.setStyle(logoutButton, { opacity: '0' });
                HTML.setStyle(featureRequestButton, { opacity: '0' });

                setTimeout(() => {
                    HTML.setStyle(settingsText, { display: 'none' });
                    HTML.setStyle(timeFormatLabel, { display: 'none' });
                    HTML.setStyle(logoutButton, { display: 'none' });
                    HTML.setStyle(featureRequestButton, { display: 'none' });

                    // Create and show "back" button
                    const backButton = HTML.make('button');
                    HTML.setId(backButton, 'featureRequestBackButton');
                    backButton.textContent = 'back';
                    HTML.setStyle(backButton, {
                        position: 'fixed',
                        right: (modalWidth - 35) + 'px',
                        top: '11px',
                        width: '40px',
                        height: '20px',
                        fontFamily: 'Monospaced',
                        fontSize: '10px',
                        color: 'var(--shade-4)',
                        backgroundColor: 'var(--shade-1)',
                        border: '1px solid var(--shade-2)',
                        borderRadius: '3px',
                        cursor: 'pointer',
                        zIndex: '7003',
                        transition: 'background-color 0.2s ease, opacity 0.2s ease-in',
                        opacity: '0'
                    });
                    HTML.body.appendChild(backButton);

                    // Create and show feature request message
                    const messageLine1 = HTML.make('div');
                    HTML.setId(messageLine1, 'featureRequestMessage1');
                    messageLine1.textContent = 'Send your feature request to';
                    HTML.setStyle(messageLine1, {
                        position: 'fixed',
                        right: '14px',
                        top: '36px',
                        width: (modalWidth - 10) + 'px',
                        fontFamily: 'Monospaced',
                        fontSize: '10px',
                        color: 'var(--shade-4)',
                        zIndex: '7003',
                        lineHeight: '1.4',
                        wordWrap: 'break-word',
                        overflowWrap: 'break-word',
                        wordBreak: 'break-word',
                        whiteSpace: 'pre-wrap',
                        opacity: '0',
                        transition: 'opacity 0.2s ease-in',
                    });

                    const emailLink = HTML.make('a');
                    HTML.setId(emailLink, 'featureRequestEmailLink');
                    emailLink.href = 'mailto:seamanwily@gmail.com';
                    emailLink.textContent = 'seamanwily@gmail.com';
                    HTML.setStyle(emailLink, {
                        position: 'fixed',
                        right: '14px',
                        top: (36 + 14) + 'px', // one line below first message
                        width: (modalWidth - 10) + 'px',
                        fontFamily: 'Monospaced',
                        fontSize: '10px',
                        color: '#0066ff',
                        textDecoration: 'underline',
                        zIndex: '7003',
                        lineHeight: '1.4',
                        wordWrap: 'break-word',
                        overflowWrap: 'break-word',
                        wordBreak: 'break-word',
                        whiteSpace: 'pre-wrap',
                        opacity: '0',
                        transition: 'opacity 0.2s ease-in',
                    });

                    // SVG code for copy icon with stroke set to shade-3
                    const copySvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="11" height="11">
                        <style>.cls-1{fill:none;stroke:var(--shade-3);stroke-miterlimit:10;stroke-width:1.3px;}</style>
                        <path class="cls-1" d="M5.18,11.13V3.48h-.7c-.77,0-1.39.62-1.39,1.39v8.35c0,.77.62,1.39,1.39,1.39h4.95c.77,0,1.39-.62,1.39-1.39v-.7h-4.25c-.77,0-1.39-.62-1.39-1.39Z"/>
                        <path class="cls-1" d="M10.82,12.52h.7c.77,0,1.39-.62,1.39-1.39V2.78c0-.77-.62-1.39-1.39-1.39h-4.95c-.77,0-1.39.62-1.39,1.39v.7"/>
                    </svg>`;

                    // Background div for copy button
                    const copyBg = HTML.make('div');
                    HTML.setId(copyBg, 'featureRequestCopyBg');
                    HTML.setStyle(copyBg, {
                        position: 'fixed',
                        right: String(modalWidth - 134) + 'px',
                        top: '50px',
                        width: '13px',
                        height: '13px',
                        backgroundColor: 'var(--shade-1)',
                        border: '1px solid var(--shade-2)',
                        borderRadius: '3px',
                        cursor: 'pointer',
                        zIndex: '7003',
                        opacity: '0',
                        transition: 'background-color 0.2s ease, opacity 0.2s ease-in',
                    });

                    // SVG icon div
                    const copyIcon = HTML.make('div');
                    HTML.setId(copyIcon, 'featureRequestCopyIcon');
                    copyIcon.innerHTML = copySvg;
                    HTML.setStyle(copyIcon, {
                        position: 'fixed',
                        right: String(modalWidth - 131) + 'px',
                        top: '-128px',
                        width: '10px',
                        height: '10px',
                        cursor: 'pointer',
                        zIndex: '7004', // slightly above background
                        opacity: '0',
                        transition: 'opacity 0.2s ease-in',
                    });

                    const copyEmailToClipboard = () => {
                        navigator.clipboard.writeText('seamanwily@gmail.com').catch(() => {});
                    };
                    copyBg.onclick = copyEmailToClipboard;
                    copyIcon.onclick = copyEmailToClipboard;

                    // Hover effects
                    copyBg.onmouseenter = () => {
                        HTML.setStyle(copyBg, { backgroundColor: 'var(--shade-2)' });
                    };
                    copyBg.onmouseleave = () => {
                        HTML.setStyle(copyBg, { backgroundColor: 'var(--shade-1)' });
                    };
                    copyIcon.onmouseenter = () => {
                        HTML.setStyle(copyBg, { backgroundColor: 'var(--shade-2)' });
                    };
                    copyIcon.onmouseleave = () => {
                        HTML.setStyle(copyBg, { backgroundColor: 'var(--shade-1)' });
                    };

                    const messageLine2 = HTML.make('div');
                    HTML.setId(messageLine2, 'featureRequestMessage2');
                    messageLine2.textContent = 'This is my personal email, and I read and reply to literally every Scribblit user :)';
                    HTML.setStyle(messageLine2, {
                        position: 'fixed',
                        right: '14px',
                        top: (36 + 28) + 'px', // two lines below first message
                        width: (modalWidth - 10) + 'px',
                        fontFamily: 'Monospaced',
                        fontSize: '10px',
                        color: 'var(--shade-4)',
                        zIndex: '7003',
                        lineHeight: '1.4',
                        wordWrap: 'break-word',
                        overflowWrap: 'break-word',
                        wordBreak: 'break-word',
                        whiteSpace: 'pre-wrap',
                        opacity: '0',
                        transition: 'opacity 0.2s ease-in',
                    });

                    HTML.body.appendChild(messageLine1);
                    HTML.body.appendChild(emailLink);
                    HTML.body.appendChild(copyBg);
                    HTML.body.appendChild(copyIcon);
                    HTML.body.appendChild(messageLine2);

                    // Force reflow and fade in
                    backButton.offsetHeight;
                    HTML.setStyle(backButton, { opacity: '1' });
                    HTML.setStyle(messageLine1, { opacity: '1' });
                    HTML.setStyle(copyBg, { opacity: '1' });
                    HTML.setStyle(copyIcon, { opacity: '1' });
                    HTML.setStyle(emailLink, { opacity: '1' });
                    HTML.setStyle(messageLine2, { opacity: '1' });

                    // Back button logic
                    backButton.onclick = () => {
                        // Fade out back button and messages
                        HTML.setStyle(backButton, { opacity: '0' });
                        HTML.setStyle(messageLine1, { opacity: '0' });
                        HTML.setStyle(copyBg, { opacity: '0' });
                        HTML.setStyle(copyIcon, { opacity: '0' });
                        HTML.setStyle(emailLink, { opacity: '0' });
                        HTML.setStyle(messageLine2, { opacity: '0' });

                        setTimeout(() => {
                            // Remove back button and messages
                            if (backButton.parentNode) HTML.body.removeChild(backButton);
                            if (messageLine1.parentNode) HTML.body.removeChild(messageLine1);
                            if (copyBg.parentNode) HTML.body.removeChild(copyBg);
                            if (copyIcon.parentNode) HTML.body.removeChild(copyIcon);
                            if (emailLink.parentNode) HTML.body.removeChild(emailLink);
                            if (messageLine2.parentNode) HTML.body.removeChild(messageLine2);

                            // Prepare original elements for fade-in
                            HTML.setStyle(settingsText, { display: 'block', opacity: '0' });
                            HTML.setStyle(timeFormatLabel, { display: 'block', opacity: '0' });
                            HTML.setStyle(logoutButton, { display: 'block', opacity: '0' });
                            HTML.setStyle(featureRequestButton, { display: 'block', opacity: '0' });

                            // Re-create selector
                            createSelector(
                                ['24hr', 'AM/PM'],
                                'horizontal',
                                'timeFormatSelector',
                                modalRect.width - 145,
                                modalRect.top + 20,
                                72, 20, 7002, 'Monospaced', 10,
                                toggleAmPmOr24,
                                user.settings.ampmOr24 === '24' ? '24hr' : 'AM/PM',
                                0.9, 'right'
                            );
                            
                            // Force reflow and fade in
                            settingsText.offsetHeight;
                            HTML.setStyle(settingsText, { opacity: '1' });
                            HTML.setStyle(timeFormatLabel, { opacity: '1' });
                            HTML.setStyle(logoutButton, { opacity: '1' });
                            HTML.setStyle(featureRequestButton, { opacity: '1' });

                        }, 200);
                    };

                    backButton.onmouseenter = () => {
                        HTML.setStyle(backButton, { backgroundColor: 'var(--shade-2)' });
                    };
                    backButton.onmouseleave = () => {
                        HTML.setStyle(backButton, { backgroundColor: 'var(--shade-1)' });
                    };
                }, 200);
            };

            HTML.body.appendChild(logoutButton);
            HTML.body.appendChild(featureRequestButton);
        }
    }, 400);
}

// Animated typing effect for "Settings" text
async function animateSettingsText(textElement) {
    const text = "Settings";
    const cursor = '\u2588'; // Unicode full block character
    
    // Type in the text character by character
    for (let i = 0; i <= text.length; i++) {
        if (!settingsModalOpen) return; // Exit if modal closed
        
        textElement.textContent = text.substring(0, i) + cursor;
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Blink cursor a few times
    for (let blinks = 0; blinks < 6; blinks++) {
        if (!settingsModalOpen) return;
        
        textElement.textContent = text + (blinks % 2 === 0 ? "" : cursor);
        await new Promise(resolve => setTimeout(resolve, 300));
    }
    
    // Slide cursor left past each letter, replacing characters as it goes
    for (let i = text.length; i >= 0; i--) {
        if (!settingsModalOpen) return;
        
        let displayText;
        if (i === text.length) {
            // When cursor is at the end, show text with cursor appended
            displayText = text + cursor;
        } else {
            // Cursor replaces the character at position i
            displayText = text.substring(0, i) + cursor + text.substring(i + 1);
        }
        textElement.textContent = displayText;
        await new Promise(resolve => setTimeout(resolve, 80));
    }
    
    // Final state - just the text without cursor
    if (settingsModalOpen) {
        textElement.textContent = text;
    }
}

function closeSettingsModal() {
    if (!settingsModalOpen) return;
    settingsModalOpen = false;
    
    const gearIcon = HTML.getElement('gearIcon');
    
    // Delete the test selector
    deleteSelector('timeFormatSelector');
    
    // Fade out settings text, time format label, and buttons
    const settingsText = HTML.getElementUnsafely('settingsText');
    const timeFormatLabel = HTML.getElementUnsafely('timeFormatLabel');
    const logoutButton = HTML.getElementUnsafely('logoutButton');
    const featureRequestButton = HTML.getElementUnsafely('featureRequestButton');
    const featureRequestBackButton = HTML.getElementUnsafely('featureRequestBackButton');
    const featureRequestMessage1 = HTML.getElementUnsafely('featureRequestMessage1');
    const featureRequestEmailLink = HTML.getElementUnsafely('featureRequestEmailLink');
    const featureRequestCopyBg = HTML.getElementUnsafely('featureRequestCopyBg');
    const featureRequestCopyIcon = HTML.getElementUnsafely('featureRequestCopyIcon');
    const featureRequestMessage2 = HTML.getElementUnsafely('featureRequestMessage2');
    
    if (settingsText) {
        HTML.setStyle(settingsText, {
            opacity: '0',
            transition: 'opacity 0.2s ease-out'
        });
        setTimeout(() => {
            if (settingsText && settingsText.parentNode) {
                HTML.body.removeChild(settingsText);
            }
        }, 200);
    }
    
    if (timeFormatLabel) {
        HTML.setStyle(timeFormatLabel, {
            opacity: '0',
            transition: 'opacity 0.2s ease-out'
        });
        setTimeout(() => {
            if (timeFormatLabel && timeFormatLabel.parentNode) {
                HTML.body.removeChild(timeFormatLabel);
            }
        }, 200);
    }
    
    if (logoutButton) {
        HTML.setStyle(logoutButton, {
            opacity: '0',
            transition: 'opacity 0.2s ease-out'
        });
        setTimeout(() => {
            if (logoutButton && logoutButton.parentNode) {
                HTML.body.removeChild(logoutButton);
            }
        }, 200);
    }
    
    if (featureRequestButton) {
        HTML.setStyle(featureRequestButton, {
            opacity: '0',
            transition: 'opacity 0.2s ease-out'
        });
        setTimeout(() => {
            if (featureRequestButton && featureRequestButton.parentNode) {
                HTML.body.removeChild(featureRequestButton);
            }
        }, 200);
    }
    
    if (featureRequestBackButton) {
        HTML.body.removeChild(featureRequestBackButton);
    }

    if (featureRequestMessage1) {
        HTML.body.removeChild(featureRequestMessage1);
    }
    if (featureRequestEmailLink) {
        HTML.body.removeChild(featureRequestEmailLink);
    }
    if (featureRequestCopyBg) {
        HTML.body.removeChild(featureRequestCopyBg);
    }
    if (featureRequestCopyIcon) {
        HTML.body.removeChild(featureRequestCopyIcon);
    }
    if (featureRequestMessage2) {
        HTML.body.removeChild(featureRequestMessage2);
    }

    if (settingsModal) {
        // Reset gear z-index
        HTML.setStyle(gearIcon, {
            zIndex: String(settingsGearZIndex),
            transform: 'rotate(0deg)'
        });
        
        // Restore sign-in button and text z-index to their normal values
        const signInButton = HTML.getElementUnsafely('signInButton');
        const signInText = HTML.getElementUnsafely('signInText');
        
        if (signInButton) {
            HTML.setStyle(signInButton, {
                zIndex: String(signInButtonZIndex)
            });
        }
        
        if (signInText) {
            HTML.setStyle(signInText, {
                zIndex: String(signInTextZIndex)
            });
        }
        
        // restore pro button (if present) to its normal z-index
        const proButtonElem = HTML.getElementUnsafely('proButton');
        const proOverlayElem = HTML.getElementUnsafely('proOverlay');
        const proTextElem = HTML.getElementUnsafely('proText');
        
        if (proButtonElem) {
            HTML.setStyle(proButtonElem, {
                zIndex: String(proButtonZIndex)
            });
        }
        if (proOverlayElem) {
            HTML.setStyle(proOverlayElem, {
                zIndex: String(proOverlayZIndex)
            });
        }
        if (proTextElem) {
            HTML.setStyle(proTextElem, {
                zIndex: String(proTextZIndex)
            });
        }
        
        // Animate modal back to button size
        HTML.setStyle(settingsModal, {
            width: '0px',
            height: '0px',
            backgroundColor: 'var(--shade-0)',
            border: '2px solid var(--shade-1)',
            borderRadius: '4px'
        });
        
        // Remove modal after animation
        setTimeout(() => {
            if (settingsModal) {
                HTML.body.removeChild(settingsModal);
                settingsModal = null;
            }
        }, 400);
    }
}

function toggleSignIn() {
    if (signInModalOpen) {
        closeSignInModal();
    } else {
        openSignInModal();
    }
}

function openSignInModal() {
    if (signInModalOpen || exists(HTML.getElementUnsafely('signInModal'))) return;
    signInModalOpen = true;
    
    const signInButton = HTML.getElement('signInButton');
    const signInText = HTML.getElement('signInText');
    
    // Get current button position and size
    const buttonRect = signInButton.getBoundingClientRect();
    
    // Calculate modal width to span from left of sign-in button to right edge of settings button
    // Settings button is at windowBorderMargin from right edge
    // Sign-in button is at windowBorderMargin + 5*(headerButtonSize + 4) from right edge
    // We want to cover this entire span plus some extra to the left
    const modalHeight = 150;
    const extraLeftWidth = 80; // Extra space to the left of sign-in button
    const distanceToSettingsRight = (headerButtonSize + 4) * 5; // Distance from sign-in to settings right edge
    const modalWidth = extraLeftWidth + buttonRect.width + distanceToSettingsRight;
    
    // Position modal so it grows left and right from the sign-in button
    const modalRight = (window.innerWidth - buttonRect.right) - distanceToSettingsRight;

    // Update sign-in button and text z-index to be above everything
    HTML.setStyle(signInText, {
        zIndex: String(signInTextZIndex + 100)
    });
    
    HTML.setStyle(signInButton, {
        zIndex: String(signInButtonZIndex + 100)
    });

    // Create modal div that starts as the button background
    signInModal = HTML.make('div');
    HTML.setId(signInModal, 'signInModal');
    HTML.setStyle(signInModal, {
        position: 'fixed',
        top: buttonRect.top + 'px',
        right: (window.innerWidth - buttonRect.right) + 'px',
        width: buttonRect.width + 'px',
        height: buttonRect.height + 'px',
        backgroundColor: 'var(--shade-0)',
        border: '2px solid var(--shade-1)',
        borderRadius: '4px',
        zIndex: String(signInModalZIndex),
        transformOrigin: 'top right',
        transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)'
    });
    
    HTML.body.appendChild(signInModal);
    
    // Force reflow
    signInModal.offsetHeight;
    
    // Start modal growth animation - expand left and right
    HTML.setStyle(signInModal, {
        width: modalWidth + 'px',
        height: modalHeight + 'px',
        right: modalRight + 'px',
        backgroundColor: 'var(--shade-0)',
        border: '2px solid var(--shade-1)',
        borderRadius: '4px'
    });
    
    // After animation completes, show initial Google and Email buttons
    setTimeout(() => {
        // state may have changed since the timeout was set
        if (!signInModalOpen) return;

        // Set initial state
        signInModalState = 'initial';

        // Use the existing showInitialButtons function for proper fade-in animation
        showInitialButtons();
        
    }, 400);
}

function slideSignInButtonOffScreen() {
    // Warp (genie) effect: button is pulled toward the settings gear while being vertically squished
    const signInButton = HTML.getElementUnsafely('signInButton');
    if (!signInButton) return;
    
    // Start the gear spin animation 500ms after the genie animation begins
    setTimeout(animateGearSpin, 500);
    
    // Attempt to locate the settings gear button so we can animate towards it
    const settingsButton = HTML.getElementUnsafely('settingsButton');
    
    // Default translation values (in case settings button isn't found)
    let translateX = 0;
    let translateY = -50; // Fallback: move up a bit
    
    if (settingsButton) {
        const signInRect = signInButton.getBoundingClientRect();
        const settingsRect = settingsButton.getBoundingClientRect();
        // Compute delta from sign-in button centre to settings button centre
        translateX = (settingsRect.left + settingsRect.width / 2) - (signInRect.left + signInRect.width / 2);
        translateY = (settingsRect.top + settingsRect.height / 2) - (signInRect.top + signInRect.height / 2);
    }

    // Apply the warp animation via CSS transform & transition
    HTML.setStyle(signInButton, {
        transformOrigin: 'center center',
        transition: 'transform 0.8s cubic-bezier(0.68, -0.55, 0.265, 1.55), opacity 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94) 0.4s',
        transform: `translate(${translateX - 40}px, ${translateY}px) scaleY(0.05)`, // almost flatten vertically
        opacity: '0'
    });

    // Remove the element after the animation completes and reveal pro button
    setTimeout(() => {
        if (signInButton && signInButton.parentNode) {
            HTML.body.removeChild(signInButton);
        }
        // After genie animation, drop the pro button into view
        initProButton(true);
    }, 850);
}

function animateGearSpin() {
    const gearIcon = HTML.getElementUnsafely('gearIcon');
    if (!gearIcon) return;
    
    // Get the current base rotation
    const startRotation = window.gearBaseRotation || 0;
    
    // Define the spin animation - starts fast and decelerates
    // Total of 3 full rotations (1080 degrees) plus some extra for effect - counterclockwise
    const totalSpinRotation = -(1080 + 180); // 3.5 full rotations counterclockwise
    const finalRotation = startRotation + totalSpinRotation;
    
    // Update the global base rotation to the final value
    window.updateGearBaseRotation(finalRotation);
    
    // Create keyframes for the decelerating spin animation
    const animationDuration = 1200; // 1.2 seconds, slightly longer than genie animation
    const startTime = performance.now();
    
    function animateStep(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / animationDuration, 1);
        
        // Ease-out cubic animation for deceleration effect
        const easeProgress = 1 - Math.pow(1 - progress, 3);
        
        // Calculate current rotation
        const currentRotation = startRotation + (totalSpinRotation * easeProgress);
        
        // Apply the rotation
        HTML.setStyle(gearIcon, {
            transform: `rotate(${currentRotation}deg)`,
            transition: 'none' // Remove transition during manual animation
        });
        
        // Continue animation if not complete
        if (progress < 1) {
            requestAnimationFrame(animateStep);
        } else {
            // Restore transition for normal hover/click behavior
            HTML.setStyle(gearIcon, {
                transform: `rotate(${finalRotation}deg)`,
                transition: 'transform 0.3s ease'
            });
        }
    }
    
    // Start the animation
    requestAnimationFrame(animateStep);
}

function closeSignInModal(slideButtonOffScreen = false) {
    if (!signInModalOpen) return;
    signInModalOpen = false;
    signInModalState = 'initial'; // Reset state when modal closes
    
    // Get all elements that need to be faded out
    const elementsToFadeOut = [
        'signInGoogleButton', 'signInEmailButton', 
        'signInEmailInput', 'signInPasswordInput', 
        'signInActionButton', 'signUpActionButton', 'verificationCodeInput',
        'verifyEmailButton', 'verificationContainer', 'verificationInstructionText',
        'signInBackButton'
    ];
    
    // Fade out all elements
    elementsToFadeOut.forEach(id => {
        const element = HTML.getElementUnsafely(id);
        if (element) {
            HTML.setStyle(element, {
                opacity: '0',
                transition: 'opacity 0.2s ease-out'
            });
        }
    });
    
    const signInButton = HTML.getElement('signInButton');
    const signInText = HTML.getElement('signInText');
    const signInModal = HTML.getElementUnsafely('signInModal');
    
    // Reset button z-indexes
    HTML.setStyle(signInButton, {
        zIndex: String(signInButtonZIndex)
    });
    
    HTML.setStyle(signInText, {
        zIndex: String(signInTextZIndex)
    });
    
    // Remove faded elements after fade animation completes
    setTimeout(() => {
        elementsToFadeOut.forEach(id => {
            const element = HTML.getElementUnsafely(id);
            if (element && element.parentNode) {
                element.parentNode.removeChild(element);
            }
        });
    }, 200);

    // Animate modal back to button size if it exists
    if (signInModal) {
        // Get button position for shrinking animation
        const buttonRect = signInButton.getBoundingClientRect();
        
        HTML.setStyle(signInModal, {
            width: '0px',
            height: '0px',
            right: (window.innerWidth - buttonRect.right + (buttonRect.width/2)) + 'px',
            backgroundColor: 'var(--shade-0)',
            border: '2px solid var(--shade-1)',
            borderRadius: '4px',
            transition: 'all 0.6s cubic-bezier(0.68, 0.0, 0.265, 1.55)'
        });
        
        // Remove modal after shrinking animation completes
        setTimeout(() => {
            if (signInModal && signInModal.parentNode) {
                HTML.body.removeChild(signInModal);
            }
            // Trigger warp now that modal animation is finished
            if (slideButtonOffScreen) {
                slideSignInButtonOffScreen();
            }
        }, 400);
    } else if (slideButtonOffScreen) {
        // If no modal exists, start warp immediately after fade
        slideSignInButtonOffScreen();
    }
}

// Helper functions for sign-in modal state management
function showEmailInputForm() {
    // Fade out Google and Email buttons
    const googleButton = HTML.getElementUnsafely('signInGoogleButton');
    const emailButton = HTML.getElementUnsafely('signInEmailButton');
    
    if (googleButton) {
        HTML.setStyle(googleButton, {
            opacity: '0',
            transition: 'opacity 0.3s ease-out'
        });
    }
    if (emailButton) {
        HTML.setStyle(emailButton, {
            opacity: '0',
            transition: 'opacity 0.3s ease-out'
        });
    }
    
    setTimeout(() => {
        // Remove the buttons
        if (googleButton && googleButton.parentNode) {
            HTML.body.removeChild(googleButton);
        }
        if (emailButton && emailButton.parentNode) {
            HTML.body.removeChild(emailButton);
        }
        
        // Get modal position for content positioning
        const signInModal = HTML.getElement('signInModal');
        if (!signInModal) return;
        
        const modalRect = signInModal.getBoundingClientRect();
        const modalWidth = modalRect.width;
        const signInFieldInputHeight = 30;
        
        // Create email input field
        const emailInput = HTML.make('input');
        HTML.setId(emailInput, 'signInEmailInput');
        emailInput.type = 'email';
        emailInput.placeholder = 'Email';
        
        HTML.setStyle(emailInput, {
            position: 'fixed',
            right: (window.innerWidth - modalRect.right + 10) + 'px',
            top: (modalRect.top + 30) + 'px',
            width: String(modalWidth - 34) + 'px',
            height: String(signInFieldInputHeight) + 'px',
            fontFamily: 'Monospace',
            fontSize: '12px',
            color: 'var(--shade-4)',
            backgroundColor: 'var(--shade-0)',
            border: '1px solid var(--shade-2)',
            borderRadius: '3px',
            padding: '0 8px',
            outline: 'none',
            zIndex: String(signInTextZIndex + 101),
            opacity: '0',
            transition: 'opacity 0.3s ease-in'
        });
        
        emailInput.addEventListener('focus', function() {
            currentlyTyping = true;
        });
        emailInput.addEventListener('blur', function() {
            currentlyTyping = false;
        });
        
        HTML.body.appendChild(emailInput);
        
        // Create password input field
        const passwordInput = HTML.make('input');
        HTML.setId(passwordInput, 'signInPasswordInput');
        passwordInput.type = 'password';
        passwordInput.placeholder = 'Password';
        
        HTML.setStyle(passwordInput, {
            position: 'fixed',
            right: (window.innerWidth - modalRect.right + 10) + 'px',
            top: (modalRect.top + 30 + 42) + 'px',
            width: String(modalWidth - 34) + 'px',
            height: String(signInFieldInputHeight) + 'px',
            fontFamily: 'Monospace',
            fontSize: '12px',
            color: 'var(--shade-4)',
            backgroundColor: 'var(--shade-0)',
            border: '1px solid var(--shade-2)',
            borderRadius: '3px',
            padding: '0 8px',
            outline: 'none',
            zIndex: String(signInTextZIndex + 101),
            opacity: '0',
            transition: 'opacity 0.3s ease-in'
        });
        
        passwordInput.addEventListener('focus', function() {
            currentlyTyping = true;
        });
        passwordInput.addEventListener('blur', function() {
            currentlyTyping = false;
        });
        
        HTML.body.appendChild(passwordInput);
        
        // Create sign in button
        const signInActionButton = HTML.make('button');
        HTML.setId(signInActionButton, 'signInActionButton');
        signInActionButton.textContent = 'Sign In';
        
        let signInSignUpButtonWidth = ((modalWidth - 34) / 2) + 5;
        
        HTML.setStyle(signInActionButton, {
            position: 'fixed',
            right: (window.innerWidth - modalRect.right + 149) + 'px',
            top: (modalRect.top + 30 + 114 - 32) + 'px',
            width: String(signInSignUpButtonWidth) + 'px',
            height: '32px',
            fontFamily: 'Monospace',
            fontSize: '12px',
            color: 'var(--shade-4)',
            backgroundColor: 'var(--shade-1)',
            border: '1px solid var(--shade-2)',
            borderRadius: '3px',
            cursor: 'pointer',
            zIndex: String(signInTextZIndex + 101),
            opacity: '0',
            transition: 'opacity 0.3s ease-in, background-color 0.2s ease'
        });
        
        signInActionButton.onclick = () => signIn();
        signInActionButton.onmouseenter = () => {
            HTML.setStyle(signInActionButton, { backgroundColor: 'var(--shade-2)' });
        };
        signInActionButton.onmouseleave = () => {
            HTML.setStyle(signInActionButton, { backgroundColor: 'var(--shade-1)' });
        };
        
        HTML.body.appendChild(signInActionButton);
        
        // Create sign up button
        const signUpActionButton = HTML.make('button');
        HTML.setId(signUpActionButton, 'signUpActionButton');
        signUpActionButton.textContent = 'Sign Up';
        
        HTML.setStyle(signUpActionButton, {
            position: 'fixed',
            right: (window.innerWidth - modalRect.right + 10) + 'px',
            top: (modalRect.top + 30 + 114 - 32) + 'px',
            width: String(signInSignUpButtonWidth) + 'px',
            height: '32px',
            fontFamily: 'Monospace',
            fontSize: '12px',
            color: 'var(--shade-4)',
            backgroundColor: 'var(--shade-1)',
            border: '1px solid var(--shade-2)',
            borderRadius: '3px',
            cursor: 'pointer',
            zIndex: String(signInTextZIndex + 101),
            opacity: '0',
            transition: 'opacity 0.3s ease-in, background-color 0.2s ease'
        });
        
        signUpActionButton.onclick = () => signUp();
        signUpActionButton.onmouseenter = () => {
            HTML.setStyle(signUpActionButton, { backgroundColor: 'var(--shade-2)' });
        };
        signUpActionButton.onmouseleave = () => {
            HTML.setStyle(signUpActionButton, { backgroundColor: 'var(--shade-1)' });
        };
        
        HTML.body.appendChild(signUpActionButton);
        
        // Create back button
        const backButton = HTML.make('button');
        HTML.setId(backButton, 'signInBackButton');
        backButton.textContent = 'back';
        HTML.setStyle(backButton, {
            position: 'fixed',
            left: (modalRect.left + 10) + 'px',
            top: (modalRect.top + 10) + 'px',
            width: '60px',
            height: '24px',
            fontFamily: 'Monospace',
            fontSize: '10px',
            color: 'var(--shade-4)',
            backgroundColor: 'var(--shade-1)',
            border: '1px solid var(--shade-2)',
            borderRadius: '3px',
            cursor: 'pointer',
            zIndex: String(signInTextZIndex + 102),
            opacity: '0',
            transition: 'opacity 0.2s ease, background-color 0.2s ease'
        });
        backButton.onmouseenter = () => {
            HTML.setStyle(backButton, { backgroundColor: 'var(--shade-2)' });
        };
        backButton.onmouseleave = () => {
            HTML.setStyle(backButton, { backgroundColor: 'var(--shade-1)' });
        };
        backButton.onclick = () => handleBackButtonClick();
        
        HTML.body.appendChild(backButton);
        
        // Fade in the form elements
        setTimeout(() => {
            HTML.setStyle(emailInput, { opacity: '1' });
            HTML.setStyle(passwordInput, { opacity: '1' });
            HTML.setStyle(signInActionButton, { opacity: '1' });
            HTML.setStyle(signUpActionButton, { opacity: '1' });
            HTML.setStyle(backButton, { opacity: '1' });
        }, 10);
        
    }, 300);
}

function showInitialButtons() {
    // Get modal position for content positioning
    const signInModal = HTML.getElement('signInModal');
    if (!signInModal) return;
    
    const modalRect = signInModal.getBoundingClientRect();
    const modalWidth = modalRect.width;
    
    // Create Google button
    const googleButton = HTML.make('button');
    HTML.setId(googleButton, 'signInGoogleButton');
    googleButton.textContent = 'Google';
    
    HTML.setStyle(googleButton, {
        position: 'fixed',
        right: (window.innerWidth - modalRect.right + 10) + 'px',
        top: (modalRect.top + 30) + 'px',
        width: ((modalWidth - 30) / 2) + 'px',
        height: '114px',
        fontFamily: 'Monospace',
        fontSize: '12px',
        color: 'var(--shade-4)',
        backgroundColor: 'var(--shade-1)',
        border: '1px solid var(--shade-2)',
        borderRadius: '3px',
        cursor: 'pointer',
        zIndex: String(signInTextZIndex + 101),
        transition: 'all 0.2s ease',
        opacity: '0'
    });
    
    googleButton.onclick = () => {
        window.location.href = 'https://' + SERVER_DOMAIN + '/auth/google';
    };
    googleButton.onmouseenter = () => {
        HTML.setStyle(googleButton, { backgroundColor: 'var(--shade-2)' });
    };
    googleButton.onmouseleave = () => {
        HTML.setStyle(googleButton, { backgroundColor: 'var(--shade-1)' });
    };
    
    HTML.body.appendChild(googleButton);
    
    // Create Email button
    const emailButton = HTML.make('button');
    HTML.setId(emailButton, 'signInEmailButton');
    emailButton.textContent = 'Email';
    
    HTML.setStyle(emailButton, {
        position: 'fixed',
        right: (window.innerWidth - modalRect.right + 20 + ((modalWidth - 30) / 2)) + 'px',
        top: (modalRect.top + 30) + 'px',
        width: ((modalWidth - 30) / 2) + 'px',
        height: '114px',
        fontFamily: 'Monospace',
        fontSize: '12px',
        color: 'var(--shade-4)',
        backgroundColor: 'var(--shade-1)',
        border: '1px solid var(--shade-2)',
        borderRadius: '3px',
        cursor: 'pointer',
        zIndex: String(signInTextZIndex + 101),
        transition: 'all 0.2s ease',
        opacity: '0'
    });
    
    emailButton.onclick = () => {
        signInModalState = 'email_input';
        showEmailInputForm();
    };
    emailButton.onmouseenter = () => {
        HTML.setStyle(emailButton, { backgroundColor: 'var(--shade-2)' });
    };
    emailButton.onmouseleave = () => {
        HTML.setStyle(emailButton, { backgroundColor: 'var(--shade-1)' });
    };
    
    HTML.body.appendChild(emailButton);
    
    // Fade them in
    setTimeout(() => {
        HTML.setStyle(googleButton, { opacity: '1' });
        HTML.setStyle(emailButton, { opacity: '1' });
    }, 10);
}

function handleBackButtonClick() {
    if (signInModalState === 'verification') {
        // Go back to email input form
        signInModalState = 'email_input';
        
        // Hide verification elements
        const verificationContainer = HTML.getElementUnsafely('verificationContainer');
        const verificationInstructionText = HTML.getElementUnsafely('verificationInstructionText');
        
        [verificationContainer, verificationInstructionText].forEach(el => {
            if (el) {
                HTML.setStyle(el, { opacity: '0', pointerEvents: 'none', transition: 'opacity 0.2s ease-out' });
            }
        });
        
        setTimeout(() => {
            [verificationContainer, verificationInstructionText].forEach(el => {
                if (el && el.parentNode) {
                    el.parentNode.removeChild(el);
                }
            });
        }, 200);
        
        // Show email input form elements
        ['signInEmailInput','signInPasswordInput','signInActionButton','signUpActionButton'].forEach(id => {
            const el = HTML.getElementUnsafely(id);
            if (el) {
                HTML.setStyle(el, { opacity: '1', pointerEvents: 'auto' });
            }
        });
        
    } else if (signInModalState === 'email_input') {
        // Go back to initial state
        signInModalState = 'initial';
        
        // Hide email input form elements
        const elementsToHide = [
            'signInEmailInput', 'signInPasswordInput',
            'signInActionButton', 'signUpActionButton', 'signInBackButton'
        ];
        
        elementsToHide.forEach(id => {
            const el = HTML.getElementUnsafely(id);
            if (el) {
                HTML.setStyle(el, { opacity: '0', pointerEvents: 'none', transition: 'opacity 0.2s ease-out' });
            }
        });
        
        setTimeout(() => {
            // Remove the old elements after fade
            elementsToHide.forEach(id => {
                const el = HTML.getElementUnsafely(id);
                if (el && el.parentNode) {
                    el.parentNode.removeChild(el);
                }
            });
            
            // Show initial buttons
            showInitialButtons();
            
        }, 220);
    }
}

function signIn() {
    const emailInput = HTML.getElement('signInEmailInput');
    const passwordInput = HTML.getElement('signInPasswordInput');

    const email = emailInput.value;
    const password = passwordInput.value;

    if (!email || !password) {
        alert('Please enter both email and password.');
        return;
    }

    const endpoint = '/login';
    const url = `https://${SERVER_DOMAIN}${endpoint}`;

    fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
    })
    .then(response => response.json())
    .then(async (data) => {
        log('Login response:', data);
        if (data.token) {
            LocalData.set('token', data.token);
            LocalData.set('signedIn', true);
            
            // Load user data from server FIRST, then update with login info
            try {
                user = await loadUserData();
                user.email = email;
                user.userId = data.id;
                await saveUserData(user);
                render(); // Re-render UI with loaded data
            } catch (error) {
                log("Error loading/saving user data after login: " + error.message);
            }
            
            alert('Login successful!');
            closeSignInModal(true); // Slide button off screen after successful login
            // Here you would typically update the UI to a logged-in state
        } else {
            alert(data.error || 'Login failed.');
        }
    })
    .catch(error => {
        console.error('Login error:', error);
        alert('An error occurred during login.');
    });
}

async function signUp() {
    const emailInput = HTML.getElement('signInEmailInput');
    const passwordInput = HTML.getElement('signInPasswordInput');
    const email = emailInput.value;
    const password = passwordInput.value;

    try {
        const response = await fetch(`https://${SERVER_DOMAIN}/signup`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (response.ok) {
            // Fade out email and password fields, sign in and sign up buttons completely
            const signInActionButton = HTML.getElement('signInActionButton');
            const signUpActionButton = HTML.getElement('signUpActionButton');
            
            HTML.setStyle(emailInput, { 
                opacity: '0',
                pointerEvents: 'none',
                transition: 'opacity 0.3s ease'
            });
            HTML.setStyle(passwordInput, { 
                opacity: '0',
                pointerEvents: 'none',
                transition: 'opacity 0.3s ease'
            });
            HTML.setStyle(signInActionButton, { 
                opacity: '0',
                pointerEvents: 'none',
                transition: 'opacity 0.3s ease'
            });
            HTML.setStyle(signUpActionButton, { 
                opacity: '0',
                pointerEvents: 'none',
                transition: 'opacity 0.3s ease'
            });

            // Get the modal rectangle for positioning
            const signInButton = HTML.getElement('signInButton');
            const modalRect = signInButton.getBoundingClientRect();
            
            // Set state to verification
            signInModalState = 'verification';
            
            // Create container for the six verification inputs
            const verificationContainer = HTML.make('div');
            HTML.setId(verificationContainer, 'verificationContainer');
            HTML.setStyle(verificationContainer, {
                position: 'fixed',
                right: '20px',
                top: '90px',
                width: '236px',
                height: '36px',
                display: 'flex',
                gap: '8px',
                zIndex: String(signInTextZIndex + 101),
                opacity: '1'
            });

            // Create and append the verification code instruction text
            const verificationInstructionText = HTML.make('div');
            HTML.setId(verificationInstructionText, 'verificationInstructionText');
            verificationInstructionText.textContent = 'Enter your six digit verification code:';
            HTML.setStyle(verificationInstructionText, {
                position: 'fixed',
                right: '22px',
                top: String(modalRect.top + 50) + 'px', // Position above the inputs, adjust as needed
                fontFamily: 'Monospaced',
                fontSize: '11px',
                color: 'var(--shade-4)',
                zIndex: String(signInTextZIndex + 101),
                opacity: '0',
                transition: 'opacity 0.3s ease-in'
            });
            HTML.body.appendChild(verificationInstructionText);

            // Adjust verificationContainer top to make space for the new text (including extra 20px)
            HTML.setStyle(verificationContainer, {
                top: String(modalRect.top + 30 + 12 + 10 + 20) + 'px',
            });

            // Create six individual character input divs
            const verificationInputs = [];

            for (let i = 0; i < 6; i++) {
                const inputDiv = HTML.make('input');
                HTML.setId(inputDiv, `verificationInput${i}`);
                inputDiv.type = 'text';
                inputDiv.maxLength = 1;
                inputDiv.value = '';
                
                HTML.setStyle(inputDiv, {
                    width: '28px',
                    height: '36px',
                    fontFamily: 'Monospaced',
                    fontSize: '14px',
                    color: 'var(--shade-4)',
                    backgroundColor: 'var(--shade-0)',
                    border: '1px solid var(--shade-2)',
                    borderRadius: '3px',
                    textAlign: 'center',
                    outline: 'none',
                    boxSizing: 'border-box',
                    caretColor: 'transparent', // Hide cursor
                    transition: 'background-color 0.2s ease-in-out' // Smooth transition for background
                });

                // Add event listeners for navigation and input
                inputDiv.addEventListener('input', function(e) {
                    const value = e.target.value;
                    const numericValue = value.replace(/\D/g, '');

                    // Always ensure only the first digit is kept if input has more than one char (paste scenario)
                    if (numericValue.length >= 1) {
                        e.target.value = numericValue.charAt(0);
                    } else {
                        e.target.value = ''; // Clear if non-digits or empty input
                    }

                    // Move to next input if a digit was entered and it's not the last input
                    if (e.target.value.length === 1 && i < 5) {
                        verificationInputs[i + 1].focus();
                    }

                    // After processing the input for the current field, check if all inputs are filled
                    let code = '';
                    for (let j = 0; j < 6; j++) {
                        code += verificationInputs[j].value;
                    }

                    // If all inputs are filled and form a valid 6-digit code, try to verify
                    if (code.length === 6 && /^\d{6}$/.test(code)) {
                        verifyEmail();
                    }
                });

                inputDiv.addEventListener('keydown', function(e) {
                    if (e.key === 'ArrowRight' && i < 5) {
                        e.preventDefault(); // Prevent default cursor movement
                        verificationInputs[i + 1].focus();
                    } else if (e.key === 'ArrowLeft' && i > 0) {
                        e.preventDefault(); // Prevent default cursor movement
                        verificationInputs[i - 1].focus();
                    } else if (e.key === 'Backspace' && e.target.value === '' && i > 0) {
                        e.preventDefault(); // Prevent default backspace behavior
                        verificationInputs[i - 1].focus();
                        verificationInputs[i - 1].value = ''; // Clear previous input on backspace
                    } else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) { // Check if a single character key (not a modifier)
                        // Overwrite the current input with the new character
                        e.target.value = ''; // Clear current value before input event fires
                    }
                });

                inputDiv.addEventListener('focus', function() {
                    currentlyTyping = true;
                    HTML.setStyle(this, { backgroundColor: 'var(--accent-0)' }); // Fade background to accent-0
                });

                inputDiv.addEventListener('blur', function() {
                    currentlyTyping = false;
                    HTML.setStyle(this, { backgroundColor: 'var(--shade-0)' }); // Fade background off
                });

                verificationInputs.push(inputDiv);
                verificationContainer.appendChild(inputDiv);
            }

            HTML.body.appendChild(verificationContainer);

            // Force reflow and fade in the instruction text
            verificationInstructionText.offsetHeight; // Trigger reflow
            HTML.setStyle(verificationInstructionText, { opacity: '1' });

            // Focus on first input
            verificationInputs[0].focus();

        } else {
            // TODO: show error message
            console.error('Sign up failed:', data.error);
        }
    } catch (error) {
        console.error('Sign up error:', error);
    }
}

async function verifyEmail() {
    const emailInput = HTML.getElement('signInEmailInput');
    const email = emailInput.value;
    
    // Collect verification code from six individual inputs
    let code = '';
    for (let i = 0; i < 6; i++) {
        const inputElement = HTML.getElement(`verificationInput${i}`);
        if (inputElement) {
            code += inputElement.value;
        }
    }

    // Validate that we have a complete 6-digit code
    if (code.length !== 6 || !/^\d{6}$/.test(code)) {
        console.error('Please enter a complete 6-digit verification code');
        // TODO: show error message in UI
        return;
    }

    try {
        const response = await fetch(`https://${SERVER_DOMAIN}/verify-email`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, code })
        });

        const data = await response.json();

        if (response.ok && data.token && data.id) {
            // Store auth token
            LocalData.set('token', data.token);
            
            // Set signed in state to true
            LocalData.set('signedIn', true);
            
            // Load user data from server FIRST, then update with signup info
            try {
                user = await loadUserData();
                user.email = email;
                user.userId = data.id;
                await saveUserData(user);
                render(); // Re-render UI with loaded data
            } catch (error) {
                log("Error loading/saving user data after verification: " + error.message);
            }
            
            closeSignInModal(true); // Slide button off screen after successful signup
        } else {
            // Show error message
            console.error('Verification failed:', data.error || 'Unknown error');
            console.error('Full response data:', data);
            // TODO: show error message in UI
        }
    } catch (error) {
        console.error('Verification error:', error);
    }
}

function logout() {
    // Clear authentication data
    LocalData.set('signedIn', false);
    LocalData.set('token', NULL);
    
    user = User.createDefault();
    
    // Save updated user data
    saveUserData(user);
    
    // Close settings modal
    closeSettingsModal();
    
    // Show sign-in button again
    initSignInButton();

    // Remove pro button if it exists
    const proButtonElem = HTML.getElementUnsafely('proButton');
    const proOverlayElem = HTML.getElementUnsafely('proOverlay');
    const proTextElem = HTML.getElementUnsafely('proText');

    [proButtonElem, proOverlayElem, proTextElem].forEach(elem => {
        if (elem && elem.parentNode) {
            elem.parentNode.removeChild(elem);
        }
    });

    render();
    
    log("User logged out successfully");
}

// Helper function to measure text width
function measureTextWidth(text, font, fontSize) {
    ASSERT(type(text, String));
    ASSERT(type(font, String));
    ASSERT(type(fontSize, Number));
    
    // Create temporary element to measure text
    const tempElement = HTML.make('div');
    HTML.setStyle(tempElement, {
        fontFamily: font,
        fontSize: fontSize + 'px',
        position: 'absolute',
        visibility: 'hidden',
        height: 'auto',
        width: 'auto',
        whiteSpace: 'nowrap'
    });
    tempElement.textContent = text;
    HTML.body.appendChild(tempElement);
    
    const width = tempElement.offsetWidth;
    HTML.body.removeChild(tempElement);
    
    return width;
}

function extractJsonFromAiOutput(aiOutput, chain, outermostJsonCharacters) {
    ASSERT(type(outermostJsonCharacters, String));
    ASSERT(outermostJsonCharacters.length === 2);
    ASSERT(outermostJsonCharacters === '[]' || outermostJsonCharacters === '{}');

    let startTime = Date.now();
    let cleanedText = aiOutput;

    // we can remove the model thinking, all that matters is the output
    // maybe the user would like to see this?
    // maybe in pro mode we store this locally so they can look at it and feel more "in control"
    const thinkClose = '</think>';
    const idx = cleanedText.indexOf(thinkClose);
    if (idx !== -1) {
        cleanedText = cleanedText.substring(idx + thinkClose.length).trim();
    }
    cleanedText = cleanedText.trim();

    // sometimes the ai puts it in a code block
    if (cleanedText.startsWith('```json')) {
        cleanedText = cleanedText.substring(7).trim();
    }
    if (cleanedText.endsWith('```')) {
        cleanedText = cleanedText.substring(0, cleanedText.length - 3).trim();
    }

    // extraction json from AI output
    let aiJson = NULL;
    try {
        aiJson = JSON.parse(cleanedText);
    } catch (e) {
        // failed to parse, but we can try more
        // try to split at [ and ] in case the ai prepended or appended text
        // get index
        const idx = cleanedText.indexOf(outermostJsonCharacters[0]);
        if (idx !== -1) {
            cleanedText = cleanedText.substring(idx + 1);
        }
        try {
            aiJson = JSON.parse(cleanedText);
        } catch (e) {
            // now try removing ] at end
            const idx = cleanedText.lastIndexOf(outermostJsonCharacters[1]);
            if (idx !== -1) {
                cleanedText = cleanedText.substring(0, idx);
            }
            try {
                aiJson = JSON.parse(cleanedText);
            } catch (e) {
                // finally give up
                return NULL;
            }
        }
    }

    chain.add(new ProcessingNode(cleanedText, startTime, "Extracting JSON from AI output", Date.now()));

    if (!aiJson) {
        return NULL;
    } else {
        return aiJson;
    }
}

function mergeEntities(entityArray, chain) {
    ASSERT(type(entityArray, List(Entity)));

    // Group entities by type
    let tasksByName = {};
    let eventsByName = {};
    let remindersByName = {};

    for (const ent of entityArray) {
        const lowerCaseName = ent.name.toLowerCase();

        if (type(ent.data, TaskData)) {
            if (!tasksByName[lowerCaseName]) tasksByName[lowerCaseName] = [];
            tasksByName[lowerCaseName].push(ent);
        } else if (type(ent.data, EventData)) {
            if (!eventsByName[lowerCaseName]) eventsByName[lowerCaseName] = [];
            eventsByName[lowerCaseName].push(ent);
        } else if (type(ent.data, ReminderData)) {
            if (!remindersByName[lowerCaseName]) remindersByName[lowerCaseName] = [];
            remindersByName[lowerCaseName].push(ent);
        }
    }

    let finalEntities = [];

    // Process tasks and merge events with the same name into them as work sessions
    let startTime = Date.now();
    for (const name in tasksByName) {
        let mergedEntities = [Entity.decode(tasksByName[name][0].encode())];
        const taskGroup = tasksByName[name];
        let primaryTask = taskGroup[0];

        // Merge tasks with the same name
        if (taskGroup.length > 1) {
            for (let i = 1; i < taskGroup.length; i++) {
                let secondaryTask = taskGroup[i];
                mergedEntities.push(Entity.decode(secondaryTask.encode()));
                primaryTask.data.instances.push(...secondaryTask.data.instances);
                primaryTask.data.workSessions.push(...secondaryTask.data.workSessions);
            }
        }

        // Check for events that are work sessions for this task
        const workSessionEventName = 'work_session: ' + name;
        if (eventsByName[workSessionEventName]) {
            const eventGroup = eventsByName[workSessionEventName];
            const primaryEvent = eventGroup[0];

            for (const event of eventGroup) {
                mergedEntities.push(Entity.decode(event.encode()));
            }

            // Merge instances from other events in the group into the primary event
            for (let i = 1; i < eventGroup.length; i++) {
                primaryEvent.data.instances.push(...eventGroup[i].data.instances);
            }
            
            // Convert event instances to work sessions for the task
            primaryTask.data.workSessions.push(...primaryEvent.data.instances);
            
            delete eventsByName[workSessionEventName];
        }

        if (mergedEntities.length > 1) {
            chain.add(new MergeEntitiesNode(mergedEntities, primaryTask, startTime, Date.now()));
        }
        finalEntities.push(primaryTask);
    }

    // Process remaining events
    startTime = Date.now();
    for (const name in eventsByName) {
        let mergedEntities = [Entity.decode(eventsByName[name][0].encode())];
        const eventGroup = eventsByName[name];
        let primaryEvent = eventGroup[0];

        if (eventGroup.length > 1) {
            for (let i = 1; i < eventGroup.length; i++) {
                let secondaryEvent = eventGroup[i];
                mergedEntities.push(Entity.decode(secondaryEvent.encode()));
                primaryEvent.data.instances.push(...secondaryEvent.data.instances);
            }
        }

        if (mergedEntities.length > 1) {
            chain.add(new MergeEntitiesNode(mergedEntities, primaryEvent, startTime, Date.now()));
        }
        finalEntities.push(primaryEvent);
    }

    // Process reminders
    startTime = Date.now();
    for (const name in remindersByName) {
        let mergedEntities = [Entity.decode(remindersByName[name][0].encode())];
        const reminderGroup = remindersByName[name];
        let primaryReminder = reminderGroup[0];

        if (reminderGroup.length > 1) {
            for (let i = 1; i < reminderGroup.length; i++) {
                let secondaryReminder = reminderGroup[i];
                mergedEntities.push(Entity.decode(secondaryReminder.encode()));
                primaryReminder.data.instances.push(...secondaryReminder.data.instances);
            }
        }

        if (mergedEntities.length > 1) {
            chain.add(new MergeEntitiesNode(mergedEntities, primaryReminder, startTime, Date.now()));
        }
        finalEntities.push(primaryReminder);
    }

    return finalEntities;
}

async function singleChainAiRequest(inputText, fileArray, chain) {
    // Send to backend AI endpoint
    const response = await fetch('https://' + SERVER_DOMAIN + '/ai/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            prompt: inputText,
            fileArray: fileArray,
            strategy: STRATEGIES.SINGLE_CHAIN
        })
    });

    if (!response.ok) {
        console.error('AI parse request failed', await response.text());
        return; // keep input for debugging
    }

    const responseJson = await response.json();

    if (responseJson.error && responseJson.error.length > 0) {
        log("Error: " + responseJson.error);
        return;
    }

    for (const nodeJson of responseJson.chain) {
        chain.addNodeFromJson(nodeJson);
    }

    // we asked the ai for an array of entities, so we need to extract it
    const aiJson = extractJsonFromAiOutput(responseJson.aiOutput, chain, '[]');

    if (aiJson === NULL) {
        log("Error: Failed to extract JSON from AI output");
        // TODO: hadle this with retry up to two more times, then give up
        return;
    }

    // Convert to internal entities
    let newEntities = []
    try {
        if (Array.isArray(aiJson)) {
            for (const obj of aiJson) {
                let startTime = Date.now();
                try {
                    let parsedEntity = Entity.fromAiJson(obj);
                    if (parsedEntity === NULL) {
                        chain.add(new FailedToCreateEntityNode(obj, startTime, Date.now()));
                    } else {
                        chain.add(new CreatedEntityNode(obj, parsedEntity, startTime, Date.now()));
                        newEntities.push(parsedEntity);
                    }
                } catch (e) {
                    chain.add(new FailedToCreateEntityNode(obj, startTime, Date.now()));
                    continue;
                }
            }
        } else {
            let startTime = Date.now();
            let parsedEntity = Entity.fromAiJson(aiJson);
            if (parsedEntity === NULL) {
                chain.add(new FailedToCreateEntityNode(aiJson, startTime, Date.now()));
            } else {
                chain.add(new CreatedEntityNode(aiJson, parsedEntity, startTime, Date.now()));
                newEntities.push(parsedEntity);
            }
        }
    } catch (e) {
        log("Error creating entities: " + e.message);
        return;
    }

    log("Entities: ");
    log(newEntities);

    newEntities = mergeEntities(newEntities, chain);

    let idsOfNewEntities = newEntities.map(ent => ent.id);

    // add to user
    for (const ent of newEntities) {
        user.entityArray.push(ent);
    }
    user.timestamp = Date.now();
    if (newEntities.length > 0) {
        saveUserData(user);
    }

    return idsOfNewEntities;
}

async function stepByStepAiRequest(inputText, fileArray, chain) {
    // Step 1: Get simplified entities
    const response1 = await fetch('https://' + SERVER_DOMAIN + '/ai/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            prompt: inputText,
            fileArray: fileArray,
            strategy: STRATEGIES.STEP_BY_STEP + ':1/2'
        })
    });

    if (!response1.ok) {
        console.error('AI parse request failed for step 1', await response1.text());
        return;
    }

    const responseJson1 = await response1.json();

    if (responseJson1.error && responseJson1.error.length > 0) {
        log("Error: " + responseJson1.error);
        return;
    }

    if (!exists(responseJson1.descriptionOfFiles)) {
        log("Error: descriptionOfFiles is required for step_by_step:1/2 strategy.");
        return;
    }

    if (!exists(responseJson1.aiOutput)) {
        log("Error: aiOutput is required for step_by_step:1/2 strategy.");
        return;
    }

    if (!exists(responseJson1.chain)) {
        log("Error: chain is required for step_by_step:1/2 strategy.");
        return;
    }

    // add chain nodes created from tracking requests on the backend
    for (const nodeJson of responseJson1.chain) {
        chain.addNodeFromJson(nodeJson);
    }

    let simplifiedEntitiesJson = extractJsonFromAiOutput(responseJson1.aiOutput, chain, '[]');
    if (simplifiedEntitiesJson === NULL) {
        // maybe there's just one entity in the ai output
        simplifiedEntitiesJson = extractJsonFromAiOutput(responseJson1.aiOutput, chain, '{}');
        if (simplifiedEntitiesJson === NULL) {
            log("Error: Expected an array of simplified entities from step 1, but got something else.");
            // TODO: hadle this with retry up to two more times, then give up
            return;
        }
    }

    // remove invalid entities
    let cleanedSimplifiedEntities = [];
    for (const entity of simplifiedEntitiesJson) {
        const kind = Object.keys(entity)[0];
        const name = entity[kind];
        
        if (!exists(kind) || !exists(name)) {
            continue;
        }

        if (!['task', 'event', 'reminder'].includes(kind)) {
            continue;
        }

        if (!name || name === '') {
            continue;
        }

        cleanedSimplifiedEntities.push(entity);
    }

    // Get task names
    let taskNames = new Set();
    for (const entity of cleanedSimplifiedEntities) {
        const kind = Object.keys(entity)[0];
        const name = entity[kind];

        if (kind === 'task') {
            entity.mayHaveWorkSession = false;
            taskNames.add(name);
        }
    }

    // Merge duplicate simplified entities
    let mergedSimplifiedEntities = [];
    const seenEntities = new Set();
    for (const entity of cleanedSimplifiedEntities) {
        const kind = Object.keys(entity)[0];
        const name = entity[kind];
        const identifier = `${kind}:${name}`;

        if (!seenEntities.has(identifier)) {
            mergedSimplifiedEntities.push(entity);
            seenEntities.add(identifier);
        }
    }

    // Remove events that have the name of a task
    // They are most likely work sessions that got mislabeled as events
    let uniqueSimplifiedEntities = [];
    for (const simplifiedEntity of mergedSimplifiedEntities) {
        const kind = Object.keys(simplifiedEntity)[0];
        if (kind === 'event') {
            const name = simplifiedEntity[kind];

            // we are not including work sessions
            if (name.startsWith('work_session:')) {
                // check if the task name is in the taskNames set
                const taskName = name.split(':').trim()[1];
                if (taskNames.has(taskName)) {
                    // find the task, and set its mayHaveWorkSession to true
                    // may or may not have been processed yet
                    for (const entity of uniqueSimplifiedEntities) {
                        if (entity.kind === 'task' && entity.name === taskName) {
                            entity.mayHaveWorkSession = true;
                        }
                    }
                    for (const entity of mergedSimplifiedEntities) {
                        if (entity.kind === 'task' && entity.name === taskName) {
                            entity.mayHaveWorkSession = true;
                        }
                    }
                }

                continue;
            }

            if (taskNames.has(name)) {
                continue;
            }
        }

        uniqueSimplifiedEntities.push(simplifiedEntity);
    }

    log('uniqueSimplifiedEntities: ');
    log(uniqueSimplifiedEntities);
    
    // this is the really long part that gets cached
    const basePromptForStep2 = `Here was the user's prompt: ${inputText}. Another AI model described the files and extracted a bunch of entities. Your have been given one of the extracted entities, and your job is to provide the complete entity. Here is a description of the files it came from: ${responseJson1.descriptionOfFiles}. Here are the extracted entities: ${JSON.stringify(uniqueSimplifiedEntities)}.`;

    // Step 2: Expand simplified entities in parallel
    const promises = uniqueSimplifiedEntities.map(simplifiedEntity => {
        let promptForStep2 = basePromptForStep2;
        promptForStep2 += ` Here is the entity you have been given: ${JSON.stringify(simplifiedEntity)}.`;
        return fetch('https://' + SERVER_DOMAIN + '/ai/parse', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt: promptForStep2,
                fileArray: [],
                strategy: STRATEGIES.STEP_BY_STEP + ':2/2',
                simplifiedEntity: simplifiedEntity
            })
        });
    });

    const responses2 = await Promise.all(promises);
    let newEntities = [];

    for (let i = 0; i < responses2.length; i++) {
        if (!responses2[i].ok) {
            console.error('AI parse request failed for step 2', await responses2[i].text());
            continue;
        }

        const responseJson = await responses2[i].json();

        if (!exists(responseJson.chain)) {
            log("Error: chain is required for step_by_step:2/2 strategy.");
            return;
        }

        if (!exists(responseJson.aiOutput)) {
            log("Error: aiOutput is required for step_by_step:2/2 strategy.");
            return;
        }

        if (!exists(responseJson.simplifiedEntity)) {
            log("Error: simplifiedEntity is required for step_by_step:2/2 strategy.");
            return;
        }

        if (responseJson.error && responseJson.error.length > 0) {
            log("Error: " + responseJson.error);
            continue;
        }

        for (const nodeJson of responseJson.chain) {
            chain.addNodeFromJson(nodeJson);
        }

        const aiJson = extractJsonFromAiOutput(responseJson.aiOutput, chain, '{}');

        if (aiJson === NULL) {
            log("Error: Failed to extract JSON from AI output");
            // TODO: hadle this with retry up to two more times, then give up
            return;
        }

        const simplifiedEntityType = Object.keys(responseJson.simplifiedEntity)[0];
        const simplifiedEntityName = responseJson.simplifiedEntity[simplifiedEntityType];

        try {
            let startTime = Date.now();
            // combine simplified entity with the new ai json
            if (simplifiedEntityType === 'task') {
                let newTaskData = TaskData.fromAiJson({
                    type: 'task',
                    instances: aiJson.instances,
                    workSessions: aiJson.workSessions
                })

                if (newTaskData === NULL) {
                    chain.add(new FailedToCreateEntityNode(aiJson, startTime, Date.now()));
                } else {
                    let newEntity = new Entity(
                        Entity.generateId(),
                        simplifiedEntityName,
                        '', // description
                        newTaskData
                    );

                    ASSERT(type(newEntity, Entity) && type(newEntity.data, TaskData));
                    chain.add(new CreatedEntityNode(aiJson, newEntity, startTime, Date.now()));
                    newEntities.push(newEntity);
                }
            } else if (simplifiedEntityType === 'event') {
                let newEventData = EventData.fromAiJson({
                    type: 'event',
                    instances: aiJson.instances
                })

                if (newEventData === NULL) {
                    chain.add(new FailedToCreateEntityNode(aiJson, startTime, Date.now()));
                } else {
                    let newEntity = new Entity(
                        Entity.generateId(),
                        simplifiedEntityName,
                        '', // description
                        newEventData
                    );
                    
                    ASSERT(type(newEntity, Entity) && type(newEntity.data, EventData));
                    chain.add(new CreatedEntityNode(aiJson, newEntity, startTime, Date.now()));
                    newEntities.push(newEntity);
                }
            } else if (simplifiedEntityType === 'reminder') {
                let newReminderData = ReminderData.fromAiJson({
                    type: 'reminder',
                    instances: aiJson.instances
                })

                if (newReminderData === NULL) {
                    chain.add(new FailedToCreateEntityNode(aiJson, startTime, Date.now()));
                } else {
                    let newEntity = new Entity(
                        Entity.generateId(),
                        simplifiedEntityName,
                        '', // description
                        newReminderData
                    );
                    
                    ASSERT(type(newEntity, Entity) && type(newEntity.data, ReminderData));
                    chain.add(new CreatedEntityNode(aiJson, newEntity, startTime, Date.now()));
                    newEntities.push(newEntity);
                }
            } else {
                log("Error: invalid simplified entity: " + JSON.stringify(responseJson.simplifiedEntity));
                return;
            }
        } catch (e) {
            chain.add(new FailedToCreateEntityNode(aiJson, startTime, Date.now()));
        }
    }

    log("Entities: ");
    log(newEntities);

    newEntities = mergeEntities(newEntities, chain);

    let idsOfNewEntities = newEntities.map(ent => ent.id);

    // add to user
    for (const ent of newEntities) {
        user.entityArray.push(ent);
    }
    user.timestamp = Date.now();
    if (newEntities.length > 0) {
        saveUserData(user);
    }

    return idsOfNewEntities;
}

// Process input when Enter key is pressed
function processInput() {
    const inputBox = HTML.getElement('inputBox');
    
    const inputText = inputBox.value.trim();
    if (inputText === '' && attachedFiles.length === 0) return;

    log("AI request triggered");

    // there is some input, so clear it
    inputBox.value = '';

    // if there are attached files, take them
    let fileArray = [...attachedFiles];
    attachedFiles = [];

    // input has been cleared, so update the placeholder to the default
    updateInputBoxPlaceholder(inputBoxDefaultPlaceholder);
    updateAttachmentBadge();

    let chain = new Chain();

    if (inputText.trim() !== '') {
        chain.add(new UserPromptNode(inputText));
    }
    if (fileArray && fileArray.length > 0) {
        for (const file of fileArray) {
            chain.add(new UserAttachmentNode(file));
        }
    }

    // Prepare enriched text with date,time,dayOfWeek (all in local timezone)
    const now = new Date();
    const dateStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0'); // YYYY-MM-DD in local timezone
    const timeStr = now.toTimeString().slice(0,5); // HH:MM (24h) in local timezone
    const dayOfWeekString = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][now.getDay()];
    let userTextWithDateInformation;
    if (inputText.trim() !== '') {
        userTextWithDateInformation = `Today is ${dayOfWeekString}, ${dateStr}, ${timeStr}.\n\n${inputText}`;
    } else {
        userTextWithDateInformation = `Today is ${dayOfWeekString}, ${dateStr}, ${timeStr}.`;
    }

    (async () => {
        // if there are files, the request is more difficult, so use step by step strategy
        let startTime = Date.now();
        if (fileArray.length > 0) {
            activeStrategy = STRATEGIES.STEP_BY_STEP;
            chain.add(new StrategySelectionNode(activeStrategy, startTime, Date.now()));
            let idsOfNewEntities = await stepByStepAiRequest(userTextWithDateInformation, fileArray, chain);
        } else {
            activeStrategy = STRATEGIES.SINGLE_CHAIN;
            chain.add(new StrategySelectionNode(activeStrategy, startTime, Date.now()));
            let idsOfNewEntities = await singleChainAiRequest(userTextWithDateInformation, fileArray, chain);
        }

        // TODO: API request asking model to rename entities HIGH PRIORITY
        // just takes in name and kind of entity, and applies common sense, like remove "Complete" from "Complete homework"

        // TODO: query the user's existing entities to see if any of them match the new entities
        // if it seems like the ai has created an entity that the user already has, delete the new entity

        // Clear input box
        inputBox.value = '';
        attachedFiles = [];
        updateAttachmentBadge();

        // Re-render UI
        render();

        chain.completeRequest();

        log("Chain: ");
        log(chain);
    })();
}

// Creates a multiple choice selector with smooth transitions
function createSelector(options, orientation, id, x, y, width, height, zIndex, font, fontSize, onSelectionChange, initialSelection, minWaitTime, alignmentSide) {
    // Robust assertions
    ASSERT(type(options, List(String)), "createSelector: options must be a list of strings");
    ASSERT(options.length >= 2, "createSelector: must have at least 2 options");
    ASSERT(type(orientation, String), "createSelector: orientation must be a string");
    ASSERT(orientation === "horizontal" || orientation === "vertical", "createSelector: orientation must be 'horizontal' or 'vertical'");
    ASSERT(type(id, NonEmptyString), "createSelector: id must be a non-empty string");
    ASSERT(type(x, Number), "createSelector: x must be a number");
    ASSERT(type(y, Number), "createSelector: y must be a number");
    ASSERT(type(width, Number), "createSelector: width must be a number");
    ASSERT(type(height, Number), "createSelector: height must be a number");
    ASSERT(width > 0, "createSelector: width must be positive");
    ASSERT(height > 0, "createSelector: height must be positive");
    ASSERT(type(zIndex, Int), "createSelector: zIndex must be an integer");
    ASSERT(type(font, String), "createSelector: font must be a string");
    ASSERT(type(fontSize, Number), "createSelector: fontSize must be a number");
    ASSERT(fontSize > 0, "createSelector: fontSize must be positive");
    ASSERT(type(onSelectionChange, Function), "createSelector: onSelectionChange must be a function");
    ASSERT(type(initialSelection, String), "createSelector: initialSelection must be a string");
    ASSERT(type(minWaitTime, Number), "createSelector: minWaitTime must be a number");
    ASSERT(minWaitTime >= 0, "createSelector: minWaitTime must be non-negative");
    ASSERT(type(alignmentSide, String), "createSelector: alignmentSide must be a string");
    ASSERT(alignmentSide === "left" || alignmentSide === "right", "createSelector: alignmentSide must be 'left' or 'right'");
    
    // Check if ID already exists
    ASSERT(!exists(HTML.getElementUnsafely(id)), "createSelector: element with id '" + id + "' already exists");
    
    // Find the index of the initial selection
    let initialIndex = -1;
    for (let i = 0; i < options.length; i++) {
        if (options[i] === initialSelection) {
            initialIndex = i;
            break;
        }
    }
    ASSERT(initialIndex !== -1, "createSelector: initialSelection '" + initialSelection + "' not found in options");

    // Calculate dimensions with 2px padding
    const padding = 2;
    const innerWidth = width - (padding * 2);
    const innerHeight = height - (padding * 2);
    
    ASSERT(innerWidth > 0, "createSelector: width too small for padding");
    ASSERT(innerHeight > 0, "createSelector: height too small for padding");
    
    // Measure text widths and calculate positions
    const textWidths = [];
    let totalTextWidth = 0;
    
    for (const option of options) {
        ASSERT(type(option, String), "createSelector: all options must be strings");
        const textWidth = measureTextWidth(option, font, fontSize);
        textWidths.push(textWidth);
        totalTextWidth += textWidth;
    }
    
    // Calculate spacing between options (at least 2px)
    const minSpacing = 2;
    const totalSpacing = (options.length - 1) * minSpacing;
    
    // Calculate available space for text (removing spacing)
    const availableWidth = innerWidth - totalSpacing;
    const availableHeight = innerHeight - totalSpacing;
    
    // Ensure we have enough space
    if (orientation === "horizontal") {
        ASSERT(totalTextWidth <= availableWidth, "createSelector: not enough horizontal space for all options");
    } else {
        ASSERT(totalTextWidth <= availableHeight, "createSelector: not enough vertical space for all options");
    }
    
    // Calculate option positions and dimensions proportionally based on text measurements
    const optionData = [];
    let currentPos = 0;
    
    for (let i = 0; i < options.length; i++) {
        const option = options[i];
        const textWidth = textWidths[i];
        
        let optionWidth, optionHeight, optionX, optionY;
        
        if (orientation === "horizontal") {
            // Allocate width proportionally based on text measurement
            const textProportion = textWidth / totalTextWidth;
            optionWidth = availableWidth * textProportion;
            optionHeight = innerHeight;
            optionX = currentPos;
            optionY = 0;
            currentPos += optionWidth + (i < options.length - 1 ? minSpacing : 0);
        } else {
            // Allocate height proportionally based on text measurement
            const textProportion = textWidth / totalTextWidth;
            optionHeight = availableHeight * textProportion;
            optionWidth = innerWidth;
            optionX = 0;
            optionY = currentPos;
            currentPos += optionHeight + (i < options.length - 1 ? minSpacing : 0);
        }
        
        optionData.push({
            text: option,
            width: optionWidth,
            height: optionHeight,
            x: optionX,
            y: optionY,
            textWidth: textWidth
        });
    }
    
    // Create background element
    const background = HTML.make('div');
    HTML.setId(background, id);
    const backgroundStyles = {
        position: 'absolute',
        top: y + 'px',
        width: width + 'px',
        height: height + 'px',
        backgroundColor: 'var(--shade-1)',
        borderRadius: '6px',
        zIndex: String(zIndex)
    };
    if (alignmentSide === 'left') {
        backgroundStyles.left = x + 'px';
    } else {
        backgroundStyles.right = x + 'px';
    }
    HTML.setStyle(background, backgroundStyles);
    
    // Store selected index in background using setData
    HTML.setData(background, 'selectedIndex', initialIndex);
    HTML.setData(background, 'options', options);
    HTML.setData(background, 'orientation', orientation);
    HTML.setData(background, 'lastSelectionTime', 0);  // Track last selection time
    HTML.setData(background, 'minWaitTime', minWaitTime * 1000);  // Convert to milliseconds

    // Create highlight element
    const highlight = HTML.make('div');
    HTML.setId(highlight, id + '_highlight');
    const selectedOption = optionData[initialIndex];
    
    // Get accent color and convert to rgba with 0.4 opacity
    const accentColorHex = user.palette.accent[1]; // secondary accent color
    const accentColorRgb = hexToRgb(accentColorHex);
    const accentColorRgba = `rgba(${accentColorRgb.r}, ${accentColorRgb.g}, ${accentColorRgb.b}, 0.4)`;
    
    // Get shade-4 color and create blended color for selected text (80% shade-4 + 20% accent)
    const shade4ColorHex = user.palette.shades[4];
    const shade4ColorRgb = hexToRgb(shade4ColorHex);
    const blendedTextColor = `rgb(${Math.round(shade4ColorRgb.r * 0.8 + accentColorRgb.r * 0.2)}, ${Math.round(shade4ColorRgb.g * 0.8 + accentColorRgb.g * 0.2)}, ${Math.round(shade4ColorRgb.b * 0.8 + accentColorRgb.b * 0.2)})`;
    
    const highlightStyles = {
        position: 'absolute',
        top: (y + padding + selectedOption.y) + 'px',
        width: selectedOption.width + 'px',
        height: selectedOption.height + 'px',
        backgroundColor: accentColorRgba,
        borderRadius: '4px',
        zIndex: String(zIndex + 1),
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
    };
    if (alignmentSide === 'left') {
        highlightStyles.left = (x + padding + selectedOption.x) + 'px';
    } else {
        highlightStyles.right = (x + padding + (innerWidth - selectedOption.x - selectedOption.width)) + 'px';
    }
    HTML.setStyle(highlight, highlightStyles);
    
    // Create text elements
    const textElements = [];
    for (let i = 0; i < options.length; i++) {
        const optionInfo = optionData[i];
        const textElement = HTML.make('div');
        HTML.setId(textElement, id + '_text_' + i);
        const textStyles = {
            position: 'absolute',
            top: (y + padding + optionInfo.y) + 'px',
            width: optionInfo.width + 'px',
            height: optionInfo.height + 'px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: font,
            fontSize: fontSize + 'px',
            color: i === initialIndex ? blendedTextColor : 'var(--shade-3)',
            zIndex: String(zIndex + 2),
            cursor: 'pointer',
            userSelect: 'none',
            transition: 'color 0.3s ease'
        };
        if (alignmentSide === 'left') {
            textStyles.left = (x + padding + optionInfo.x) + 'px';
        } else {
            textStyles.right = (x + padding + (innerWidth - optionInfo.x - optionInfo.width)) + 'px';
        }
        HTML.setStyle(textElement, textStyles);
        textElement.textContent = optionInfo.text;
        
        // Click handler
        textElement.onclick = () => {
            const currentIndex = HTML.getData(background, 'selectedIndex');
            const lastSelectionTime = HTML.getData(background, 'lastSelectionTime');
            const minWaitTimeMs = HTML.getData(background, 'minWaitTime');
            const currentTime = Date.now();
            
            // Check if enough time has passed since last selection
            if (currentTime - lastSelectionTime < minWaitTimeMs) {
                return; // Silently ignore the click
            }
            
            if (currentIndex !== i) {
                // Update selected index and timestamp
                HTML.setData(background, 'selectedIndex', i);
                HTML.setData(background, 'lastSelectionTime', currentTime);
                
                // Move highlight smoothly
                const targetOption = optionData[i];
                const updateHighlightStyles = {
                    top: (y + padding + targetOption.y) + 'px',
                    width: targetOption.width + 'px',
                    height: targetOption.height + 'px',
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                };
                if (alignmentSide === 'left') {
                    updateHighlightStyles.left = (x + padding + targetOption.x) + 'px';
                } else {
                    updateHighlightStyles.right = (x + padding + (innerWidth - targetOption.x - targetOption.width)) + 'px';
                }
                HTML.setStyle(highlight, updateHighlightStyles);
                
                // Update text colors with smooth transitions
                for (let j = 0; j < textElements.length; j++) {
                    HTML.setStyle(textElements[j], {
                        color: j === i ? blendedTextColor : 'var(--shade-3)',
                        transition: 'color 0.3s ease'
                    });
                }
                
                // Call the callback function with the selected option
                onSelectionChange(optionInfo.text);
            }
        };
        
        // Hover handlers
        textElement.onmouseenter = () => {
            const currentIndex = HTML.getData(background, 'selectedIndex');
            if (currentIndex !== i) {
                HTML.setStyle(textElement, {
                    color: blendedTextColor,
                    transition: 'color 0.2s ease'
                });
            }
        };
        
        textElement.onmouseleave = () => {
            const currentIndex = HTML.getData(background, 'selectedIndex');
            if (currentIndex !== i) {
                HTML.setStyle(textElement, {
                    color: 'var(--shade-3)',
                    transition: 'color 0.2s ease'
                });
            }
        };
        
        textElements.push(textElement);
    }
    
    // Add all elements to DOM
    HTML.body.appendChild(background);
    HTML.body.appendChild(highlight);
    for (const textElement of textElements) {
        HTML.body.appendChild(textElement);
    }
    
    // Handle fade-in animation for creation
    const allElements = [background, highlight, ...textElements];
    
    // Start with opacity 0
    for (const element of allElements) {
        HTML.setStyle(element, { opacity: '0' });
    }
    
    // Fade in after a brief delay
    setTimeout(() => {
        for (const element of allElements) {
            HTML.setStyle(element, { 
                opacity: '1', 
                transition: 'opacity 0.3s ease' 
            });
        }
    }, 50);
    
    // Return calculated dimensions
    return {
        width: width,
        height: height,
        actualWidth: width,
        actualHeight: height
    };
}

// Deletes a selector and all its components
function deleteSelector(id) {
    ASSERT(type(id, NonEmptyString), "deleteSelector: id must be a non-empty string");
    
    const background = HTML.getElementUnsafely(id);
    if (!exists(background)) {
        return; // Already deleted or never existed
    }
    
    const options = HTML.getData(background, 'options');
    ASSERT(type(options, List(String)), "deleteSelector: invalid options data");
    
    // Fade out all elements
    const highlight = HTML.getElementUnsafely(id + '_highlight');
    const allElements = [background];
    
    if (exists(highlight)) {
        allElements.push(highlight);
    }
    
    for (let i = 0; i < options.length; i++) {
        const textElement = HTML.getElementUnsafely(id + '_text_' + i);
        if (exists(textElement)) {
            allElements.push(textElement);
        }
    }
    
    // Apply fade out animation
    for (const element of allElements) {
        HTML.setStyle(element, {
            opacity: '0',
            transition: 'opacity 0.3s ease'
        });
    }
    
    // Remove elements after animation
    setTimeout(() => {
        for (const element of allElements) {
            if (exists(element) && exists(element.parentNode)) {
                element.parentNode.removeChild(element);
            }
        }
    }, 300);
}

function initSettingsButton() {
    // Track base rotation that accumulates with each click
    let baseRotation = 0;
    // Track if gear animation is in progress
    let gearAnimating = false;
    
    // Make baseRotation accessible globally for genie animation
    window.gearBaseRotation = baseRotation;
    window.updateGearBaseRotation = (newRotation) => {
        baseRotation = newRotation;
        window.gearBaseRotation = baseRotation;
    };
    
    // Settings button (background for gear - uses modal z-index for seamless transition)
    let settingsButton = HTML.make('div');
    HTML.setId(settingsButton, 'settingsButton');
    HTML.setStyle(settingsButton, {
        position: 'absolute',
        top: '6px',
        right: String(windowBorderMargin) + 'px',
        width: String(headerButtonSize) + 'px',
        height: String(headerButtonSize) + 'px',
        backgroundColor: 'var(--shade-1)',
        borderRadius: '4px',
        userSelect: 'none',
        cursor: 'pointer',
        transition: 'all 0.3s ease',
        zIndex: String(settingsButtonZIndex)
    });

    let gearIconSvg = `
        <svg xmlns="http://www.w3.org/2000/svg" version="1.1" viewBox="0 0 100 100">
            <defs>
                <style>
                .st0 {
                    fill: var(--shade-3);
                }
                </style>
            </defs>
            <path class="st0" d="M89,46.1c0-1.5-.7-2.5-2-2.9-.9-.3-1.9-.7-2.9-1h-.1c-.8-.3-1.6-.7-2.5-.9-.6-.2-1-.6-1.2-1.2-.3-.9-.7-1.8-1.1-2.7v-.2c-.4-.7-.6-1.3-.8-1.9-.2-.5-.2-1,0-1.5.4-.8.8-1.7,1.2-2.5.6-1.2,1.1-2.3,1.6-3.5.4-.9.2-2.2-.5-2.9-.9-.9-1.8-1.9-2.7-2.8-.8-.8-1.6-1.7-2.4-2.5-1-1-2.1-1.2-3.4-.6-1.9.9-3.8,1.8-5.7,2.7-.5.2-1,.2-1.5,0-.7-.2-1.3-.5-2-.8h-.2c-.9-.4-1.8-.8-2.7-1.1-.6-.2-1-.7-1.2-1.2-.3-.8-.6-1.6-.8-2.4-.4-1.1-.8-2.2-1.2-3.3-.4-1.3-1.3-1.9-2.6-1.9-2.6,0-4.9,0-7.3,0h0c-1.3,0-2.2.6-2.7,1.9-.5,1.6-1.3,3.6-2.1,5.7-.2.5-.6.9-1.1,1.1-1.6.7-3.2,1.3-5,2-.5.2-1,.2-1.5,0-2-.9-4-1.9-5.7-2.7-.4-.2-.9-.4-1.5-.4s-1.4.3-2,.9c-1.6,1.7-3.3,3.4-5,5-1,1-1.2,2.1-.6,3.3.9,1.9,1.8,3.8,2.7,5.7.2.5.6,1.1,0,1.6-.7,1.7-1.5,3.3-2.3,5-.2.5-.6.8-1.1,1-2,.7-4.1,1.5-6.2,2.1-1.4.4-2.1,1.4-2,2.8,0,2.2,0,4.5,0,7.1,0,1.4.6,2.3,2,2.7,1.2.4,2.4.8,3.6,1.2h.3c.7.4,1.5.6,2.2.9.6.2,1,.6,1.2,1.2.6,1.7,1.4,3.3,2.2,4.9.3.6.3,1.2,0,1.8-.5,1-1,2-1.4,3-.4.9-.8,1.7-1.2,2.5-.6,1.2-.4,2.3.5,3.2,1.7,1.7,3.4,3.4,5.1,5.1,1,1,2,1.2,3.3.6,1.9-.9,3.8-1.9,5.7-2.7.3-.1.5-.2.8-.2s.5,0,.8.2c1.7.7,3.4,1.5,5,2.2.5.2.8.6,1,1.1.6,1.6,1.3,3.6,2,5.8.5,1.6,1.5,2.3,3.1,2.3h.2c.9,0,1.9,0,3,0s2.5,0,3.5,0h.1c1.4,0,2.4-.7,2.8-2.1.4-1.3.9-2.6,1.3-3.9.2-.7.5-1.3.7-2,.2-.6.6-1,1.2-1.2,1.7-.7,3.3-1.4,4.9-2.1.5-.3,1.2-.3,1.7,0,1.2.6,2.4,1.1,3.6,1.7l.6.3c.4.2.7.3,1,.5,0,0,.2,0,.2.1.4.2,1,.5,1.6.5.6,0,1.2-.3,1.6-.7.8-.8,1.5-1.6,2.3-2.4l.9-.9c.8-.9,1.6-1.6,2.3-2.3.7-.8.8-2.1.4-3-.5-1.1-1-2.3-1.6-3.4v-.2c-.5-.8-.8-1.5-1.2-2.3-.2-.5-.2-1,0-1.5.6-1.7,1.2-3.3,1.9-5,.2-.5.6-.9,1.1-1.1,1.6-.7,3.4-1.3,5.4-2,.6-.2,2.2-.8,2.1-3,0-2,0-4.1,0-6.8ZM65.5,49.6c0,8.2-6.7,14.9-15,14.8-8.3,0-14.9-6.7-14.8-15.1,0-8.2,6.7-14.7,15.1-14.7,8.1,0,14.7,6.8,14.7,15Z"/>
        </svg>
    `
    
    // Gear icon (separate div, positioned independently, above background)
    let gearIcon = HTML.make('div');
    HTML.setId(gearIcon, 'gearIcon');
    gearIcon.innerHTML = gearIconSvg;
    HTML.setStyle(gearIcon, {
        position: 'absolute',
        top: '6px',
        right: String(windowBorderMargin) + 'px',
        width: String(headerButtonSize) + 'px',
        height: String(headerButtonSize) + 'px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
        cursor: 'pointer',
        transition: 'transform 0.3s ease',
        zIndex: String(settingsGearZIndex)
    });
    
    // Event handlers
    settingsButton.onclick = () => {
        // Prevent clicks during animation
        if (gearAnimating) return;
        
        // Set animation state to true
        gearAnimating = true;
        
        toggleSettings();
        // Increment base rotation by 60 degrees on each click
        baseRotation += 60;
        window.updateGearBaseRotation(baseRotation);
        // Update the gear rotation immediately to show the change
        HTML.setStyle(gearIcon, { 
            transform: `rotate(${baseRotation + 60}deg)` 
        });
        
        // Reset animation state after animation completes (300ms transition)
        setTimeout(() => {
            gearAnimating = false;
        }, 300);
    };
    
    settingsButton.onmouseenter = () => {
        // Use the potentially updated base rotation
        const currentBase = window.gearBaseRotation || baseRotation;
        HTML.setStyle(gearIcon, { 
            transform: `rotate(${currentBase + 60}deg)` 
        });
        HTML.setStyle(settingsButton, {
            backgroundColor: 'var(--shade-2)'
        });
    };
    
    settingsButton.onmouseleave = () => {
        // Use the potentially updated base rotation
        const currentBase = window.gearBaseRotation || baseRotation;
        HTML.setStyle(gearIcon, { 
            transform: `rotate(${currentBase}deg)` 
        });
        HTML.setStyle(settingsButton, {
            backgroundColor: 'var(--shade-1)'
        });
    };
    
    // Add both elements to body
    HTML.body.appendChild(settingsButton);
    HTML.body.appendChild(gearIcon);
}

function initSignInButton() {
    // Only show sign-in button if user is not signed in
    if (LocalData.get('signedIn')) {
        return;
    }
    
    // Sign-in button width is wider than standard buttons for the text
    const signInButtonWidth = measureTextWidth('sign in/up', 'Monospaced', 11) + 10;
    
    // Sign-in button container
    let signInButton = HTML.make('div');
    HTML.setId(signInButton, 'signInButton');
    HTML.setStyle(signInButton, {
        position: 'absolute',
        top: '6px',
        right: String(windowBorderMargin + headerButtonSize + 4 + headerButtonSize + 4 + headerButtonSize + 4 + headerButtonSize + 4 + headerButtonSize + 4) + 'px', // Position to the left of left nav button
        width: String(signInButtonWidth) + 'px',
        height: String(headerButtonSize) + 'px',
        backgroundColor: 'var(--shade-1)',
        borderRadius: '4px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        userSelect: 'none',
        cursor: 'pointer',
        transition: 'all 0.3s ease',
        zIndex: String(signInButtonZIndex)
    });
    
    // Sign-in text
    let signInText = HTML.make('div');
    HTML.setId(signInText, 'signInText');
    HTML.setStyle(signInText, {
        fontSize: '11px',
        fontFamily: 'Monospaced',
        color: 'var(--shade-3)',
        whiteSpace: 'nowrap',
        zIndex: String(signInTextZIndex)
    });
    signInText.textContent = 'sign in/up';
    
    // Event handlers
    signInButton.onclick = () => {
        toggleSignIn();
    };
    
    // Hover effect
    signInButton.onmouseenter = () => {
        HTML.setStyle(signInButton, {
            backgroundColor: 'var(--shade-2)'
        });
    };
    
    signInButton.onmouseleave = () => {
        HTML.setStyle(signInButton, {
            backgroundColor: 'var(--shade-1)'
        });
    };
    
    // Assemble the button
    signInButton.appendChild(signInText);
    HTML.body.appendChild(signInButton);
}

// appears when user is signed in and on free plan
function initProButton(animateFromTop = false) {
    // Prevent duplicate creation
    if (HTML.getElementUnsafely('proButton')) return;

    // Only show the button if the user is signed in AND on the free plan
    if (!LocalData.get('signedIn') || !user || user.plan !== 'free') {
        return;
    }

    // Width based on the text "pro" with a little padding
    const proButtonWidth = measureTextWidth('pro', 'Monospaced', 11) + 10;

    // Common right offset identical to where the sign-in button would have been
    const rightOffset = windowBorderMargin + headerButtonSize + 4 + headerButtonSize + 4 + headerButtonSize + 4 + headerButtonSize + 4 + headerButtonSize + 4;

    // Starting top position
    const finalTopPx = 6;
    const startTopPx = -(headerButtonSize + 10);

    // Grey background container
    const proButton = HTML.make('div');
    HTML.setId(proButton, 'proButton');
    HTML.setStyle(proButton, {
        position: 'absolute',
        top: (animateFromTop ? String(startTopPx) : String(finalTopPx)) + 'px',
        right: String(rightOffset) + 'px',
        width: String(proButtonWidth) + 'px',
        height: String(headerButtonSize) + 'px',
        backgroundColor: 'var(--shade-1)',
        borderRadius: '4px',
        userSelect: 'none',
        cursor: 'pointer',
        transition: `all 0.3s ease${animateFromTop ? ', top 0.6s cubic-bezier(0.4, 0, 0.2, 1)' : ''}`,
        zIndex: String(proButtonZIndex)
    });

    // Gradient overlay (initially invisible)
    const proOverlay = HTML.make('div');
    HTML.setId(proOverlay, 'proOverlay');
    HTML.setStyle(proOverlay, {
        position: 'absolute',
        top: (animateFromTop ? String(startTopPx) : String(finalTopPx)) + 'px',
        right: String(rightOffset) + 'px',
        width: String(proButtonWidth) + 'px',
        height: String(headerButtonSize) + 'px',
        pointerEvents: 'none',
        borderRadius: '4px',
        background: 'linear-gradient(to right, var(--accent-0), var(--accent-1))',
        opacity: '0',
        transition: `opacity 0.3s ease${animateFromTop ? ', top 0.6s cubic-bezier(0.4, 0, 0.2, 1)' : ''}`,
        zIndex: String(proOverlayZIndex)
    });

    // Text element (separate div, on top of overlay)
    const proText = HTML.make('div');
    HTML.setId(proText, 'proText');
    HTML.setStyle(proText, {
        position: 'absolute',
        top: (animateFromTop ? String(startTopPx) : String(finalTopPx)) + 'px',
        right: String(rightOffset) + 'px',
        width: String(proButtonWidth) + 'px',
        height: String(headerButtonSize) + 'px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '11px',
        fontFamily: 'Monospaced',
        color: 'var(--shade-3)',
        whiteSpace: 'nowrap',
        pointerEvents: 'none',
        transition: `color 0.3s ease${animateFromTop ? ', top 0.6s cubic-bezier(0.4, 0, 0.2, 1)' : ''}`,
        zIndex: String(proTextZIndex)
    });
    proText.textContent = 'pro';

    // Hover interaction handled on background div
    proButton.onmouseenter = () => {
        HTML.setStyle(proButton, { backgroundColor: 'var(--shade-2)' });
        HTML.setStyle(proOverlay, { opacity: '1' });
        HTML.setStyle(proText, { color: 'var(--shade-4)' });
    };

    proButton.onmouseleave = () => {
        HTML.setStyle(proButton, { backgroundColor: 'var(--shade-1)' });
        HTML.setStyle(proOverlay, { opacity: '0' });
        HTML.setStyle(proText, { color: 'var(--shade-3)' });
    };

    // Click handler (placeholder)
    proButton.onclick = () => {
        log('pro upgrade clicked');
        // TODO: open upgrade modal / redirect to billing
    };

    // Append all three elements (order matters for stacking)
    HTML.body.appendChild(proButton);
    HTML.body.appendChild(proOverlay);
    HTML.body.appendChild(proText);

    // Trigger drop-down animation on next frame
    if (animateFromTop) {
        requestAnimationFrame(() => {
            HTML.setStyle(proButton, { top: String(finalTopPx) + 'px' });
            HTML.setStyle(proOverlay, { top: String(finalTopPx) + 'px' });
            HTML.setStyle(proText, { top: String(finalTopPx) + 'px' });
        });
    }
 }

function initLeftNavigationButton() {
    // Track hover state for this button
    let isHovering = false;
    
    // Left navigation button container
    let leftNavButton = HTML.make('div');
    HTML.setId(leftNavButton, 'leftNavButton');
    HTML.setStyle(leftNavButton, {
        position: 'absolute',
        top: '6px',
        right: String(windowBorderMargin + headerButtonSize + 4 + headerButtonSize + 4 + headerButtonSize + 4 + headerButtonSize + 4) + 'px', // Position to the left of right nav button
        width: String(headerButtonSize) + 'px',
        height: String(headerButtonSize) + 'px',
        backgroundColor: 'var(--shade-1)',
        borderRadius: '4px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        userSelect: 'none',
        cursor: 'pointer',
        transition: 'all 0.3s ease'
    });
    
    // First left arrow triangle
    let leftArrow1 = HTML.make('div');
    HTML.setId(leftArrow1, 'leftArrow1');
    HTML.setStyle(leftArrow1, {
        width: '0',
        height: '0',
        borderTop: '5px solid transparent',
        borderBottom: '5px solid transparent',
        borderRight: '8px solid var(--shade-3)',
        pointerEvents: 'none',
        position: 'absolute',
        transition: 'transform 0.2s ease'
    });
    
    // Second left arrow triangle
    let leftArrow2 = HTML.make('div');
    HTML.setId(leftArrow2, 'leftArrow2');
    HTML.setStyle(leftArrow2, {
        width: '0',
        height: '0',
        borderTop: '5px solid transparent',
        borderBottom: '5px solid transparent',
        borderRight: '8px solid var(--shade-3)',
        pointerEvents: 'none',
        position: 'absolute',
        transition: 'transform 0.2s ease'
    });
    
    // Function to update arrow positions based on state
    const updateArrowPositions = () => {
        if (isHovering && G_shiftKeyState.isHeld) {
            // Fast-forward mode: spread arrows apart
            HTML.setStyle(leftArrow1, {
                transform: 'translateX(-4px)'
            });
            HTML.setStyle(leftArrow2, {
                transform: 'translateX(4px)'
            });
        } else {
            // Normal mode: arrows together
            HTML.setStyle(leftArrow1, {
                transform: 'translateX(0px)'
            });
            HTML.setStyle(leftArrow2, {
                transform: 'translateX(0px)'
            });
        }
    };
    
    // Register for shift key state changes
    registerShiftKeyCallback((shiftHeld) => {
        updateArrowPositions();
    });
    
    // Event handlers
    leftNavButton.onclick = (e) => {
        navigateCalendar('left', e.shiftKey);
    };
    
    leftNavButton.onmouseenter = () => {
        isHovering = true;
        HTML.setStyle(leftNavButton, {
            backgroundColor: 'var(--shade-2)'
        });
        updateArrowPositions();
    };
    
    leftNavButton.onmouseleave = () => {
        isHovering = false;
        HTML.setStyle(leftNavButton, {
            backgroundColor: 'var(--shade-1)'
        });
        updateArrowPositions();
    };
    
    // Assemble the button
    leftNavButton.appendChild(leftArrow1);
    leftNavButton.appendChild(leftArrow2);
    HTML.body.appendChild(leftNavButton);
}

function initRightNavigationButton() {
    // Track hover state for this button
    let isHovering = false;
    
    // Right navigation button container
    let rightNavButton = HTML.make('div');
    HTML.setId(rightNavButton, 'rightNavButton');
    HTML.setStyle(rightNavButton, {
        position: 'absolute',
        top: '6px',
        right: String(windowBorderMargin + headerButtonSize + 4 + headerButtonSize + 4 + headerButtonSize + 4) + 'px', // Position to the left of number of calendar days button
        width: String(headerButtonSize) + 'px',
        height: String(headerButtonSize) + 'px',
        backgroundColor: 'var(--shade-1)',
        borderRadius: '4px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        userSelect: 'none',
        cursor: 'pointer',
        transition: 'all 0.3s ease'
    });
    
    // First right arrow triangle
    let rightArrow1 = HTML.make('div');
    HTML.setId(rightArrow1, 'rightArrow1');
    HTML.setStyle(rightArrow1, {
        width: '0',
        height: '0',
        borderTop: '5px solid transparent',
        borderBottom: '5px solid transparent',
        borderLeft: '8px solid var(--shade-3)',
        pointerEvents: 'none',
        position: 'absolute',
        transition: 'transform 0.2s ease'
    });
    
    // Second right arrow triangle
    let rightArrow2 = HTML.make('div');
    HTML.setId(rightArrow2, 'rightArrow2');
    HTML.setStyle(rightArrow2, {
        width: '0',
        height: '0',
        borderTop: '5px solid transparent',
        borderBottom: '5px solid transparent',
        borderLeft: '8px solid var(--shade-3)',
        pointerEvents: 'none',
        position: 'absolute',
        transition: 'transform 0.2s ease'
    });
    
    // Function to update arrow positions based on state
    const updateArrowPositions = () => {
        if (isHovering && G_shiftKeyState.isHeld) {
            // Fast-forward mode: spread arrows apart
            HTML.setStyle(rightArrow1, {
                transform: 'translateX(-4px)'
            });
            HTML.setStyle(rightArrow2, {
                transform: 'translateX(4px)'
            });
        } else {
            // Normal mode: arrows together
            HTML.setStyle(rightArrow1, {
                transform: 'translateX(0px)'
            });
            HTML.setStyle(rightArrow2, {
                transform: 'translateX(0px)'
            });
        }
    };
    
    // Register for shift key state changes
    registerShiftKeyCallback((shiftHeld) => {
        updateArrowPositions();
    });
    
    // Event handlers
    rightNavButton.onclick = (e) => {
        navigateCalendar('right', e.shiftKey);
    };
    
    rightNavButton.onmouseenter = () => {
        isHovering = true;
        HTML.setStyle(rightNavButton, {
            backgroundColor: 'var(--shade-2)'
        });
        updateArrowPositions();
    };
    
    rightNavButton.onmouseleave = () => {
        isHovering = false;
        HTML.setStyle(rightNavButton, {
            backgroundColor: 'var(--shade-1)'
        });
        updateArrowPositions();
    };
    
    // Assemble the button
    rightNavButton.appendChild(rightArrow1);
    rightNavButton.appendChild(rightArrow2);
    HTML.body.appendChild(rightNavButton);
}

init();