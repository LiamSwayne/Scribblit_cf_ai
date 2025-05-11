/*
DEPRECATED SPECIFICATION
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
                        dueTime: HH:MM (24 hour time) (OPTIONAL)
                        completion: array of unix times corresponding to the date/times for which the task has been completed
                            [
                                int,
                                ...
                            ]
                    },
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
                    same contents as an event instance
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
                    },
                    ...
                ]
        }
}
*/

// Date
class DateField {
    constructor(year, month, day) {
        ASSERT(exists(year));
        ASSERT(typeof year === "number");
        ASSERT(Number.isInteger(year));
        
        ASSERT(exists(month));
        ASSERT(typeof month === "number");
        ASSERT(Number.isInteger(month));
        ASSERT(month >= 1 && month <= 12);
        
        ASSERT(exists(day));
        ASSERT(typeof day === "number");
        ASSERT(Number.isInteger(day));
        ASSERT(day >= 1 && day <= 31);
        
        // Additional validation for days in month (including leap years)
        const daysInMonth = new Date(year, month, 0).getDate();
        ASSERT(day <= daysInMonth);
        
        this.year = year;
        this.month = month;
        this.day = day;
    }

    static fromYYYY_MM_DD(dateString) {
        // assertions
        ASSERT(exists(dateString));
        ASSERT(typeof dateString === "string");
        ASSERT(dateString.length === 10);
        ASSERT(dateString[4] === '-' && dateString[7] === '-');
        const parts = dateString.split('-');
        return new DateField(Number(parts[0]), Number(parts[1]), Number(parts[2]));
    }
}

// Time
class TimeField {
    constructor(hour, minute) {
        ASSERT(exists(hour));
        ASSERT(typeof hour === "number");
        ASSERT(Number.isInteger(hour));
        ASSERT(hour >= 0 && hour <= 23);
        
        ASSERT(exists(minute));
        ASSERT(typeof minute === "number");
        ASSERT(Number.isInteger(minute));
        ASSERT(minute >= 0 && minute <= 59);
        
        this.hour = hour;
        this.minute = minute;
    }
}

// Recurrence patterns
class EveryNDaysPattern {
    constructor(initialDate, n) {
        ASSERT(exists(initialDate));
        ASSERT(initialDate instanceof DateField);
        
        ASSERT(exists(n));
        ASSERT(typeof n === "number");
        ASSERT(Number.isInteger(n));
        ASSERT(n > 0);
        
        this.initialDate = initialDate;
        this.n = n;
    }
}

class MonthlyPattern {
    constructor(day) {
        ASSERT(exists(day));
        ASSERT(typeof day === "number");
        ASSERT(Number.isInteger(day));
        ASSERT(day >= 1 && day <= 31);
        
        this.day = day;
    }
}

class AnnuallyPattern {
    constructor(month, day) {
        ASSERT(exists(month));
        ASSERT(typeof month === "number");
        ASSERT(Number.isInteger(month));
        ASSERT(month >= 1 && month <= 12);
        
        ASSERT(exists(day));
        ASSERT(typeof day === "number");
        ASSERT(Number.isInteger(day));
        ASSERT(day >= 1 && day <= 31);
        
        // Additional validation for days in month
        const daysInMonth = new Date(2020, month, 0).getDate();
        ASSERT(day <= daysInMonth);
        
        this.month = month;
        this.day = day;
    }
}

// Range specs
class DateRange {
    constructor(startDate, endDate) {
        ASSERT(exists(startDate));
        ASSERT(startDate instanceof DateField);
        
        // endDate can be NULL (optional)
        if (endDate !== NULL) {
            ASSERT(endDate instanceof DateField);
            
            // Convert to Date objects for comparison
            const startDateObj = new Date(startDate.year, startDate.month - 1, startDate.day);
            const endDateObj = new Date(endDate.year, endDate.month - 1, endDate.day);
            ASSERT(endDateObj >= startDateObj);
        }
        
        this.startDate = startDate;
        this.endDate = endDate;
    }
}

class RecurrenceCount {
    constructor(count) {
        ASSERT(exists(count));
        ASSERT(typeof count === "number");
        ASSERT(Number.isInteger(count));
        ASSERT(count > 0);
        
        this.count = count;
    }
}

// Task instances
class NonRecurringTaskInstance {
    constructor(date, dueTime, completion) {
        ASSERT(exists(date));
        ASSERT(date instanceof DateField);
        
        // dueTime can be NULL (optional)
        if (dueTime !== NULL) {
            ASSERT(dueTime instanceof TimeField);
        }
        
        ASSERT(exists(completion));
        ASSERT(Array.isArray(completion));
        // Validate each completion timestamp is a number (unix time)
        completion.forEach(timestamp => {
            ASSERT(typeof timestamp === "number");
            ASSERT(Number.isInteger(timestamp));
        });
        
        this.date = date;
        this.dueTime = dueTime;
        this.completion = completion;
    }
}

class RecurringTaskInstance {
    constructor(datePattern, dueTime, range, completion) {
        ASSERT(exists(datePattern));
        ASSERT(
            datePattern instanceof EveryNDaysPattern || 
            datePattern instanceof MonthlyPattern || 
            datePattern instanceof AnnuallyPattern
        );
        
        // dueTime can be NULL (optional)
        if (dueTime !== NULL) {
            ASSERT(dueTime instanceof TimeField);
        }
        
        ASSERT(exists(range));
        ASSERT(range instanceof DateRange || range instanceof RecurrenceCount);
        
        ASSERT(exists(completion));
        ASSERT(Array.isArray(completion));
        // Validate each completion timestamp is a number (unix time)
        completion.forEach(timestamp => {
            ASSERT(typeof timestamp === "number");
            ASSERT(Number.isInteger(timestamp));
        });
        
        this.datePattern = datePattern;
        this.dueTime = dueTime;
        this.range = range;
        this.completion = completion;
    }
}

// Event instances
class NonRecurringEventInstance {
    constructor(startDate, startTime, endTime, differentEndDate = NULL) {
        ASSERT(exists(startDate));
        ASSERT(startDate instanceof DateField);
        
        // startTime and endTime can be NULL (optional)
        if (startTime !== NULL) {
            ASSERT(startTime instanceof TimeField);
        }
        
        if (endTime !== NULL) {
            ASSERT(endTime instanceof TimeField);
            
            // If both start and end times are provided, validate end is after start on same day
            if (startTime !== NULL && differentEndDate === NULL) {
                const startMinutes = startTime.hour * 60 + startTime.minute;
                const endMinutes = endTime.hour * 60 + endTime.minute;
                ASSERT(endMinutes > startMinutes);
            }
        }
        
        // differentEndDate is optional
        if (differentEndDate !== NULL) {
            ASSERT(differentEndDate instanceof DateField);
            
            // Convert to Date objects for comparison
            const startDateObj = new Date(startDate.year, startDate.month - 1, startDate.day);
            const endDateObj = new Date(differentEndDate.year, differentEndDate.month - 1, differentEndDate.day);
            ASSERT(endDateObj > startDateObj);
        }
        
        this.startDate = startDate;
        this.startTime = startTime;
        this.endTime = endTime;
        this.differentEndDate = differentEndDate;
    }
}

class RecurringEventInstance {
    constructor(startDatePattern, startTime, endTime, range, differentEndDatePattern = NULL) {
        ASSERT(exists(startDatePattern));
        ASSERT(
            startDatePattern instanceof EveryNDaysPattern || 
            startDatePattern instanceof MonthlyPattern || 
            startDatePattern instanceof AnnuallyPattern
        );
        
        // startTime and endTime can be NULL (optional)
        if (startTime !== NULL) {
            ASSERT(startTime instanceof TimeField);
        }
        
        if (endTime !== NULL) {
            ASSERT(endTime instanceof TimeField);
            
            // If both start and end times are provided, validate end is after start on same day (if not multi-day)
            if (startTime !== NULL && differentEndDatePattern === NULL) {
                const startMinutes = startTime.hour * 60 + startTime.minute;
                const endMinutes = endTime.hour * 60 + endTime.minute;
                ASSERT(endMinutes > startMinutes);
            }
        }
        
        ASSERT(exists(range));
        ASSERT(range instanceof DateRange || range instanceof RecurrenceCount);
        
        // differentEndDatePattern is optional
        if (differentEndDatePattern !== NULL) {
            ASSERT(typeof differentEndDatePattern === "number");
            ASSERT(Number.isInteger(differentEndDatePattern));
            ASSERT(differentEndDatePattern > 0);
        }
        
        this.startDatePattern = startDatePattern;
        this.startTime = startTime;
        this.endTime = endTime;
        this.range = range;
        this.differentEndDatePattern = differentEndDatePattern;
    }
}

// TaskData and EventData
class TaskData {
    constructor(instances, hideUntil, showOverdue, workSessions) {
        ASSERT(exists(instances));
        ASSERT(Array.isArray(instances));
        instances.forEach(instance => {
            ASSERT(
                instance instanceof NonRecurringTaskInstance || 
                instance instanceof RecurringTaskInstance
            );
        });
        
        // hideUntil is optional
        if (hideUntil !== NULL) {
            ASSERT(exists(hideUntil.kind));
            ASSERT(typeof hideUntil.kind === "string");
            ASSERT(['dayOf', 'relative', 'date'].includes(hideUntil.kind));
            
            if (hideUntil.kind === 'relative') {
                ASSERT(exists(hideUntil.value));
                ASSERT(typeof hideUntil.value === "number");
                ASSERT(Number.isInteger(hideUntil.value));
            } else if (hideUntil.kind === 'date') {
                ASSERT(exists(hideUntil.value));
                ASSERT(hideUntil.value instanceof DateField);
            }
        }
        
        ASSERT(exists(showOverdue));
        ASSERT(typeof showOverdue === "boolean");
        
        // workSessions is optional
        if (workSessions !== NULL) {
            ASSERT(Array.isArray(workSessions));
            workSessions.forEach(session => {
                ASSERT(
                    session instanceof NonRecurringEventInstance || 
                    session instanceof RecurringEventInstance
                );
            });
        }
        
        this.instances = instances;
        this.hideUntil = hideUntil;
        this.showOverdue = showOverdue;
        this.workSessions = workSessions;
    }
}

class EventData {
    constructor(instances) {
        ASSERT(exists(instances));
        ASSERT(Array.isArray(instances));
        instances.forEach(instance => {
            ASSERT(
                instance instanceof NonRecurringEventInstance || 
                instance instanceof RecurringEventInstance
            );
        });
        
        this.instances = instances;
    }
}

// Task or Event container, the uppermost level of the data structure
class TaskOrEvent {
    constructor(id, name, description, data) {
        ASSERT(exists(id));
        ASSERT(typeof id === "string");
        ASSERT(id.length > 0);
        
        ASSERT(exists(name));
        ASSERT(typeof name === "string");
        ASSERT(name.length > 0);
        
        // description is optional
        if (description !== NULL) {
            ASSERT(typeof description === "string");
        }
        
        ASSERT(exists(data));
        ASSERT(data instanceof TaskData || data instanceof EventData);
        
        this.id = id;
        this.name = name;
        this.description = description;
        this.data = data;
    }
}

// String format symbols for date components
const YYYY_MM_DD = Symbol('YYYY_MM_DD');
const YYYY = Symbol('YYYY');
const MM = Symbol('MM');
const DD = Symbol('DD');
const DAY_OF_WEEK = Symbol('DAY_OF_WEEK');

// type checking function
function type(thing, sometype) {
    ASSERT(exists(thing));
    ASSERT(exists(sometype));
    // NULL type handling
    if (sometype === NULL) {
        return thing === NULL;
    }
    // List type handling
    if (sometype instanceof List) {
        if (!Array.isArray(thing)) return false;
        for (const elem of thing) {
            if (!type(elem, sometype.innertype)) return false;
        }
        return true;
    }
    // Class type checks using constructors for validation
    if (sometype === DateField) {
        if (!exists(thing.year) || !exists(thing.month) || !exists(thing.day)) return false;
        try { new DateField(thing.year, thing.month, thing.day); return true; } catch (e) { return false; }
    }
    if (sometype === TimeField) {
        if (!exists(thing.hour) || !exists(thing.minute)) return false;
        try { new TimeField(thing.hour, thing.minute); return true; } catch (e) { return false; }
    }
    if (sometype === EveryNDaysPattern) {
        if (!exists(thing.initialDate) || !exists(thing.n)) return false;
        if (!type(thing.initialDate, DateField)) return false;
        try { new EveryNDaysPattern(thing.initialDate, thing.n); return true; } catch (e) { return false; }
    }
    if (sometype === MonthlyPattern) {
        if (!exists(thing.day)) return false;
        try { new MonthlyPattern(thing.day); return true; } catch (e) { return false; }
    }
    if (sometype === AnnuallyPattern) {
        if (!exists(thing.month) || !exists(thing.day)) return false;
        try { new AnnuallyPattern(thing.month, thing.day); return true; } catch (e) { return false; }
    }
    if (sometype === DateRange) {
        if (!exists(thing.startDate)) return false;
        if (!type(thing.startDate, DateField)) return false;
        const endDate = thing.endDate;
        if (endDate !== NULL && !type(endDate, DateField)) return false;
        try { new DateRange(thing.startDate, endDate); return true; } catch (e) { return false; }
    }
    if (sometype === RecurrenceCount) {
        if (!exists(thing.count)) return false;
        try { new RecurrenceCount(thing.count); return true; } catch (e) { return false; }
    }
    if (sometype === NonRecurringTaskInstance) {
        if (!exists(thing.date) || !exists(thing.dueTime) || !exists(thing.completion)) return false;
        if (!type(thing.date, DateField)) return false;
        const dueTime = thing.dueTime;
        if (dueTime !== NULL && !type(dueTime, TimeField)) return false;
        if (!Array.isArray(thing.completion)) return false;
        try { new NonRecurringTaskInstance(thing.date, dueTime, thing.completion); return true; } catch (e) { return false; }
    }
    if (sometype === RecurringTaskInstance) {
        if (!exists(thing.datePattern) || !exists(thing.dueTime) || !exists(thing.range) || !exists(thing.completion)) return false;
        if (!type(thing.datePattern, EveryNDaysPattern) && !type(thing.datePattern, MonthlyPattern) && !type(thing.datePattern, AnnuallyPattern)) return false;
        const dueTime2 = thing.dueTime;
        if (dueTime2 !== NULL && !type(dueTime2, TimeField)) return false;
        if (!type(thing.range, DateRange) && !type(thing.range, RecurrenceCount)) return false;
        if (!Array.isArray(thing.completion)) return false;
        try { new RecurringTaskInstance(thing.datePattern, dueTime2, thing.range, thing.completion); return true; } catch (e) { return false; }
    }
    if (sometype === NonRecurringEventInstance) {
        if (!exists(thing.startDate) || !exists(thing.startTime) || !exists(thing.endTime) || !exists(thing.differentEndDate)) return false;
        if (!type(thing.startDate, DateField)) return false;
        const startTime = thing.startTime;
        if (startTime !== NULL && !type(startTime, TimeField)) return false;
        const endTime = thing.endTime;
        if (endTime !== NULL && !type(endTime, TimeField)) return false;
        const diffEndDate = thing.differentEndDate;
        if (diffEndDate !== NULL && !type(diffEndDate, DateField)) return false;
        try { new NonRecurringEventInstance(thing.startDate, startTime, endTime, diffEndDate); return true; } catch (e) { return false; }
    }
    if (sometype === RecurringEventInstance) {
        if (!exists(thing.startDatePattern) || !exists(thing.startTime) || !exists(thing.endTime) || !exists(thing.range) || !exists(thing.differentEndDatePattern)) return false;
        if (!type(thing.startDatePattern, EveryNDaysPattern) && !type(thing.startDatePattern, MonthlyPattern) && !type(thing.startDatePattern, AnnuallyPattern)) return false;
        const startTime2 = thing.startTime;
        if (startTime2 !== NULL && !type(startTime2, TimeField)) return false;
        const endTime2 = thing.endTime;
        if (endTime2 !== NULL && !type(endTime2, TimeField)) return false;
        if (!type(thing.range, DateRange) && !type(thing.range, RecurrenceCount)) return false;
        const dep = thing.differentEndDatePattern;
        if (dep !== NULL && !(typeof dep === 'number' && Number.isInteger(dep) && dep > 0)) return false;
        try { new RecurringEventInstance(thing.startDatePattern, startTime2, endTime2, thing.range, dep); return true; } catch (e) { return false; }
    }
    if (sometype === TaskData) {
        if (!exists(thing.instances) || !Array.isArray(thing.instances)) return false;
        const hideUntil = thing.hideUntil;
        const workSessions = thing.workSessions;
        if (hideUntil !== NULL && !exists(hideUntil.kind)) return false;
        if (workSessions !== NULL && !Array.isArray(workSessions)) return false;
        try { new TaskData(thing.instances, hideUntil, thing.showOverdue, workSessions); return true; } catch (e) { return false; }
    }
    if (sometype === EventData) {
        if (!exists(thing.instances) || !Array.isArray(thing.instances)) return false;
        try { new EventData(thing.instances); return true; } catch (e) { return false; }
    }
    if (sometype === TaskOrEvent) {
        if (!exists(thing.id) || !exists(thing.name) || !exists(thing.data)) return false;
        try { new TaskOrEvent(thing.id, thing.name, thing.description, thing.data); return true; } catch (e) { return false; }
    }
    // Primitive type checks
    if (sometype === Number) return typeof thing === 'number';
    if (sometype === String) return typeof thing === 'string';
    if (sometype === Boolean) return typeof thing === 'boolean';
    if (sometype === Symbol) return typeof thing === 'symbol';
    if (sometype === BigInt) return typeof thing === 'bigint';
    // String format symbols for date components
    if (sometype === YYYY_MM_DD) {
        if (typeof thing !== 'string') return false;
        const parts = thing.split('-');
        if (parts.length !== 3) return false;
        const year = Number(parts[0]);
        const month = Number(parts[1]);
        const day = Number(parts[2]);
        if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
        try {
            new DateField(year, month, day);
            return true;
        } catch (e) {
            return false;
        }
    }
    if (sometype === YYYY) {
        if (typeof thing !== 'string' || thing.length !== 4) return false;
        const y = Number(thing);
        if (!Number.isInteger(y)) return false;
        return true;
    }
    if (sometype === MM) {
        if (typeof thing !== 'string' || thing.length !== 2) return false;
        const m = Number(thing);
        if (!Number.isInteger(m) || m < 1 || m > 12) return false;
        return true;
    }
    if (sometype === DD) {
        if (typeof thing !== 'string' || thing.length !== 2) return false;
        const d = Number(thing);
        if (!Number.isInteger(d) || d < 1 || d > 31) return false;
        return true;
    }
    if (sometype === DAY_OF_WEEK) {
        if (typeof thing !== 'string') return false;
        const dow = thing;
        const valid = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
        return valid.includes(dow);
    }
    // Default object instance check
    return thing instanceof sometype;
}let TESTING = true;

if (TESTING) {
    localStorage.clear();
    
    // AUDIT OF AI CODE NEEDED
    // Create sample tasks and events
    let taskEventArray = [
        // one-time task with work time
        new TaskOrEvent(
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
        new TaskOrEvent(
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
        new TaskOrEvent(
            'task-003', // id
            'Monthly Budget Review', // name
            'Review and update monthly budget', // description
            new TaskData( // data
                [
                    new RecurringTaskInstance(
                        new MonthlyPattern(1), // datePattern
                        new TimeField(10, 0), // dueTime
                        new RecurrenceCount(6), // range
                        [] // completion
                    )
                ], // instances
                NULL, // hideUntil
                true, // showOverdue
                NULL // workSessions
            ) // data
        ),
    
        // one-time all-day event
        new TaskOrEvent(
            'event-001', // id
            'Company Holiday', // name
            'Annual company holiday', // description
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
        new TaskOrEvent(
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
        new TaskOrEvent(
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
        new TaskOrEvent(
            'event-004', // id
            'Weekend Workshop', // name
            'Weekend coding workshop', // description
            new EventData( // data
                [
                    new RecurringTaskInstance(
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
        )
    ];      

    // Create user object with the sample data
    let user = {
        taskEventArray: taskEventArray,
        settings: {
            stacking: false,
            numberOfCalendarDays: 2,
            ampmOr24: 'ampm',
            startOfDayOffset: 0,
            endOfDayOffset: 0,
        },
        palette: {
            accent: ['#47b6ff', '#b547ff'],
            shades: ['#111111', '#383838', '#636363', '#9e9e9e', '#ffffff']
        },
        firstDayInCalendar: new Date().toISOString().split('T')[0] // Today's date
    };
    
    // Store in localStorage and it will be discovered later
    localStorage.setItem("userData", JSON.stringify(user));
}

const DateTime = luxon.DateTime; // .local() sets the timezone to the user's timezone

// returns today's ISO date or the date offset from today by the given number of days
function getDay(offset) {
    ASSERT(type(offset, Int) && offset >= 0 && offset < 7);
    let dt = DateTime.local();
    if (offset > 0) {
        dt = dt.plus({days: offset});
    }
    
    // Create a DateField object instead of string
    return new DateField(dt.year, dt.month, dt.day);
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
    // create a user with the default settings
    user = {
        taskEventArray: taskEventArray,
        settings: {
                stacking: false,
                numberOfCalendarDays: 2,
                ampmOr24: 'ampm',
                // make a day span at a different time
                // for example if you wake up at 9 and go to bed at 3, you could make march 1st start at march 1st 9am and end at march 2nd at 3am
                startOfDayOffset: 0,
                endOfDayOffset: 0,
            },
        palette: palettes['dark'],
        firstDayInCalendar: getDay(0) // set to today as DateField
    };
    localStorage.setItem("userData", JSON.stringify(user));
} else {
    user = JSON.parse(localStorage.getItem("userData"));
    ASSERT(exists(user.taskEventArray) && exists(user.settings));
    ASSERT(type(user.settings.stacking, Boolean));
    ASSERT(type(user.settings.numberOfCalendarDays, Int));
    ASSERT(1 <= user.settings.numberOfCalendarDays && user.settings.numberOfCalendarDays <= 7, "userData.settings.numberOfCalendarDays out of range 1-7");
    ASSERT(user.settings.ampmOr24 == 'ampm' || user.settings.ampmOr24 == '24');
    ASSERT(Array.isArray(user.taskEventArray));
    
    // Convert the firstDayInCalendar from string to DateField if needed
    if (typeof user.firstDayInCalendar === "string") {
        user.firstDayInCalendar = DateField.fromYYYY_MM_DD(user.firstDayInCalendar);
    } else if (!exists(user.firstDayInCalendar)) {
        user.firstDayInCalendar = getDay(0); // Default to today
    }
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

// the current days to display
function currentDays() {
    // firstDayInCalendar must be DateField
    ASSERT(type(user.firstDayInCalendar, DateField));
    // numberOfCalendarDays must be Int between 1 and 7
    ASSERT(type(user.settings.numberOfCalendarDays, Int) && user.settings.numberOfCalendarDays >= 1 && user.settings.numberOfCalendarDays <= 7);
    let days = [];
    for (let i = 0; i < user.settings.numberOfCalendarDays; i++) {
        // Create DateField for each day
        let date;
        if (i === 0) {
            date = user.firstDayInCalendar;
        } else {
            // Create a new date by adding days to the first date
            let dt = DateTime.local(user.firstDayInCalendar.year, user.firstDayInCalendar.month, user.firstDayInCalendar.day).plus({days: i});
            date = new DateField(dt.year, dt.month, dt.day);
        }
        days.push(date);
    }
    return days;
}

// returns today, yesterday, tomorrow, or the day of the week
// 'day' must be a DateField object
function dayOfWeekOrRelativeDay(day) {
    ASSERT(day instanceof DateField);
    
    // Convert DateField to DateTime for comparison
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

    resetHoverStyle(element, styles) {
        ASSERT(element != null && element != undefined && styles != undefined && styles != null);
        ASSERT(Object.keys(styles).length > 0);
        
        // Check if element has an ID
        const elementId = element.id;
        ASSERT(elementId && elementId.length > 0, "Element must have an ID to use setHoverStyle");

        // remove existing style element
        let existingStyleElement = document.getElementById(`style-${elementId}`);
        if (existingStyleElement != null) {
            existingStyleElement.remove();
        }
        
        // Build CSS string
        let cssRules = `#${elementId}:hover {`;
        for (let key of Object.keys(styles)) {
            ASSERT(typeof(key) == "string");
            ASSERT(exists(styles[key]));
    
            // camelcase to hyphenated css property
            let cssKey = key.replace(/([a-z0-9]|(?=[A-Z]))([A-Z])/g, '$1-$2').toLowerCase();
            cssRules += `${cssKey}: ${styles[key]}; `;
        }
        cssRules += `}`;
        
        // Add a transition property to enable animations if desired
        cssRules += `#${elementId} { transition: all 0.3s ease; }`;
        
        // Create and append style element
        const styleElement = HTML.make('style');
        HTML.setId(styleElement, `style-${elementId}`);
        styleElement.textContent = cssRules;
        HTML.head.appendChild(styleElement);
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
    ASSERT(type(user.settings.stacking, Boolean) && type(user.settings.numberOfCalendarDays, Int));
    if (user.settings.stacking) {
        return Math.floor(user.settings.numberOfCalendarDays / 2) + 1;
    }
    return user.settings.numberOfCalendarDays + 1;
}

function nthHourText(n) {
    ASSERT(type(n, Int));
    ASSERT(0 <= n && n < 24, "nthHourText n out of range 0-23");
    ASSERT(user.settings.ampmOr24 === 'ampm' || user.settings.ampmOr24 === '24', "user.settings.ampmOr24 must be 'ampm' or '24'");
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

// code written by AI
// needs to be audited!!!
// Helper function to generate all instances of a recurring pattern within a given range
function generateInstancesFromPattern(instance, startUnix = null, endUnix = null) {
    if (!instance.recurring || !exists(instance.datePattern)) {
        return [];
    }
    
    // Determine start and end dates for the pattern
    let startDate, endDate;
    
    // If a specific range is provided in function call, use that
    if (startUnix !== null) {
        startDate = DateTime.fromMillis(startUnix);
    } else if (exists(instance.range) && instance.range.kind === 'dateRange' && 
              exists(instance.range.dateRange) && exists(instance.range.dateRange.start)) {
        startDate = DateTime.fromISO(instance.range.dateRange.start);
    } else {
        // Default to pattern's initial date or today if no start provided
        if (instance.datePattern.kind === 'everyNDays' && 
            exists(instance.datePattern.everyNDays)) {
            startDate = DateTime.local(
                instance.datePattern.everyNDays.initialYear || DateTime.local().year,
                instance.datePattern.everyNDays.initialMonth,
                instance.datePattern.everyNDays.initialDay
            );
        } else {
            startDate = DateTime.local();
        }
    }
    
    // For pattern end date
    if (endUnix !== null) {
        endDate = DateTime.fromMillis(endUnix);
    } else if (exists(instance.range) && instance.range.kind === 'dateRange' && 
              exists(instance.range.dateRange) && exists(instance.range.dateRange.end)) {
        endDate = DateTime.fromISO(instance.range.dateRange.end);
    } else if (exists(instance.range) && instance.range.kind === 'recurrenceCount' &&
              exists(instance.range.recurrenceCount)) {
        // Handle recurrence count - we'll calculate this later
        endDate = null;
    } else {
        // If no end is specified, we return an empty array as this is an indefinite pattern
        return [];
    }
    
    let allDates = [];
    let currentDate = startDate;
    let recurrenceCount = 0;
    let maxRecurrences = exists(instance.range) && instance.range.kind === 'recurrenceCount' ? 
                         instance.range.recurrenceCount : Number.MAX_SAFE_INTEGER;
    
    // Generate dates based on pattern type
    while ((endDate === null || currentDate <= endDate) && recurrenceCount < maxRecurrences) {
        // Convert to unix timestamp (considering the time if provided)
        let timestamp = currentDate.startOf('day').toMillis();
        if (exists(instance.time)) {
            let [hours, minutes] = instance.time.split(':').map(Number);
            timestamp = currentDate.set({hour: hours, minute: minutes}).toMillis();
        }
        
        allDates.push(timestamp);
        recurrenceCount++;
        
        // Calculate next date based on pattern
        if (instance.datePattern.kind === 'everyNDays') {
            currentDate = currentDate.plus({days: instance.datePattern.everyNDays.n});
        } else if (instance.datePattern.kind === 'monthly') {
            currentDate = currentDate.plus({months: 1});
        } else if (instance.datePattern.kind === 'annually') {
            currentDate = currentDate.plus({years: 1});
        } else {
            break; // Unknown pattern
        }
    }
    
    return allDates;
}

// AI AUDIT NEEDED
// check if all of a task is complete
function isTaskComplete(task) {
    // If the task doesn't exist or doesn't have instances, it can't be complete
    if (!exists(task) || !exists(task.instances) || !Array.isArray(task.instances) || task.instances.length === 0) {
        return false;
    }
    
    // Check each instance
    for (let instance of task.instances) {
        // For non-recurring tasks, check if there's at least one completion
        if (!instance.recurring) {
            if (!exists(instance.completion) || !Array.isArray(instance.completion) || instance.completion.length === 0) {
                return false; // No completions for this non-recurring task
            }
            
            // For non-recurring tasks, convert the date to a unix timestamp
            let taskDate = DateTime.fromISO(instance.date);
            if (!taskDate.isValid) {
                return false; // Invalid date
            }
            
            // Add time if specified
            let timestamp = taskDate.startOf('day').toMillis();
            if (exists(instance.time)) {
                let [hours, minutes] = instance.time.split(':').map(Number);
                timestamp = taskDate.set({hour: hours, minute: minutes}).toMillis();
            }
            
            // Check if this specific time is marked as completed
            if (!instance.completion.some(completionTime => {
                // Allow some leeway in completion time (same day)
                let completionDate = DateTime.fromMillis(completionTime);
                let taskDateOnly = DateTime.fromMillis(timestamp).startOf('day');
                return completionDate.hasSame(taskDateOnly, 'day');
            })) {
                return false; // This specific task time hasn't been completed
            }
        } 
        // For recurring tasks
        else {
            // First, check if this is a definite pattern
            if (!exists(instance.range)) {
                return false; // Indefinite pattern with no range
            }
            
            if (instance.range.kind === 'dateRange') {
                if (!exists(instance.range.dateRange) || !exists(instance.range.dateRange.end)) {
                    return false; // Indefinite pattern with no end date
                }
                
                // Generate all instances of this pattern within the date range
                let startDate = DateTime.fromISO(instance.range.dateRange.start).startOf('day').toMillis();
                let endDate = DateTime.fromISO(instance.range.dateRange.end).endOf('day').toMillis();
                let patternInstances = generateInstancesFromPattern(instance, startDate, endDate);
                
                // Check if we have all completions needed
                if (!exists(instance.completion) || !Array.isArray(instance.completion)) {
                    return false; // No completions array
                }
                
                // For each pattern instance, ensure there's a matching completion
                for (let patternTime of patternInstances) {
                    let patternDate = DateTime.fromMillis(patternTime).startOf('day');
                    
                    // Check if any completion matches this pattern instance (same day)
                    let hasMatching = instance.completion.some(completionTime => {
                        let completionDate = DateTime.fromMillis(completionTime);
                        return completionDate.hasSame(patternDate, 'day');
                    });
                    
                    if (!hasMatching) {
                        return false; // Missing completion for this pattern instance
                    }
                }
            } 
            else if (instance.range.kind === 'recurrenceCount') {
                if (!exists(instance.range.recurrenceCount) || instance.range.recurrenceCount <= 0) {
                    return false; // Invalid recurrence count
                }
                
                // Generate pattern instances based on recurrence count
                let patternInstances = generateInstancesFromPattern(instance);
                
                // Check if we have all the needed completions
                if (!exists(instance.completion) || !Array.isArray(instance.completion) || 
                    instance.completion.length < instance.range.recurrenceCount) {
                    return false; // Not enough completions
                }
                
                // Match each pattern instance with a completion
                // For recurrence count, we need exactly recurrenceCount completions
                if (patternInstances.length !== instance.range.recurrenceCount) {
                    return false;
                }
                
                for (let patternTime of patternInstances) {
                    let patternDate = DateTime.fromMillis(patternTime).startOf('day');
                    
                    // Check if any completion matches this pattern instance (same day)
                    let hasMatching = instance.completion.some(completionTime => {
                        let completionDate = DateTime.fromMillis(completionTime);
                        return completionDate.hasSame(patternDate, 'day');
                    });
                    
                    if (!hasMatching) {
                        return false; // Missing completion for this pattern instance
                    }
                }
            }
            else {
                return false; // Unknown range kind
            }
        }
    }
    
    // If we've made it through all instances without returning false, the task is complete
    return true;
}

// code written by AI
// needs to be audited!!!
// Helper to generate all instances of a recurring pattern within a given range
function generateInstancesFromPattern(instance, startUnix = NULL, endUnix = NULL) {
    ASSERT(exists(instance), "instance is required");
    ASSERT(typeof instance.recurring === "boolean", "instance.recurring must be a boolean");

    // Identify whether this is a task (dueTime + datePattern) or an event (startTime + startDatePattern)
    let pattern;
    let timeKey;
    if (exists(instance.datePattern)) {
        pattern = instance.datePattern;
        timeKey = 'dueTime';
    } else if (exists(instance.startDatePattern)) {
        pattern = instance.startDatePattern;
        timeKey = 'startTime';
    } else {
        ASSERT(false, "Instance must have datePattern or startDatePattern");
    }

    if (!instance.recurring) {
        return [];
    }
    ASSERT(typeof pattern.kind === "string", "pattern.kind must be a string");

    // Determine start date
    let startDate;
    if (startUnix !== NULL) {
        startDate = DateTime.fromMillis(startUnix);
    } else if (exists(instance.range)
               && instance.range.kind === 'dateRange'
               && exists(instance.range.dateRange.start)) {
        startDate = DateTime.fromISO(instance.range.dateRange.start);
    } else if (pattern.kind === 'everyNDays') {
        ASSERT(exists(pattern.everyNDays), "everyNDays data is required");
        startDate = DateTime.local(
            pattern.everyNDays.initialYear || DateTime.local().year,
            pattern.everyNDays.initialMonth,
            pattern.everyNDays.initialDay
        );
    } else {
        startDate = DateTime.local();
    }

    // Determine end date
    let endDate;
    if (endUnix !== NULL) {
        endDate = DateTime.fromMillis(endUnix);
    } else if (exists(instance.range)
               && instance.range.kind === 'dateRange'
               && exists(instance.range.dateRange.end)) {
        endDate = DateTime.fromISO(instance.range.dateRange.end);
    } else if (exists(instance.range) && instance.range.kind === 'recurrenceCount') {
        ASSERT(typeof instance.range.recurrenceCount === 'number' && instance.range.recurrenceCount > 0,
               "range.recurrenceCount must be a positive integer");
        endDate = NULL;
    } else {
        ASSERT(false, "Cannot determine end date for recurring instance");
    }

    let dates = [];
    let current = startDate;
    let count = 0;
    let maxCount = (exists(instance.range) && instance.range.kind === 'recurrenceCount')
                   ? instance.range.recurrenceCount
                   : Number.MAX_SAFE_INTEGER;

    while ((endDate === NULL || current <= endDate) && count < maxCount) {
        // build timestamp (start of day + optional time)
        let timestamp = current.startOf('day').toMillis();
        if (exists(instance[timeKey])) {
            // strictly require "HH:MM"
            ASSERT(/^\d{2}:\d{2}$/.test(instance[timeKey]), `${timeKey} must be in HH:MM format`);
            let [hh, mm] = instance[timeKey].split(':').map(Number);
            timestamp = current.set({hour: hh, minute: mm}).toMillis();
        }
        dates.push(timestamp);
        count++;

        // step to next
        if (pattern.kind === 'everyNDays') {
            current = current.plus({days: pattern.everyNDays.n});
        } else if (pattern.kind === 'monthly') {
            current = current.plus({months: 1}).set({day: pattern.monthly});
        } else if (pattern.kind === 'annually') {
            current = current.plus({years: 1})
                             .set({month: pattern.annually.month, day: pattern.annually.day});
        } else {
            ASSERT(false, `Unknown pattern.kind: ${pattern.kind}`);
        }
    }

    return dates;
}

// Main to check if a task is complete
function isTaskComplete(task) {
    ASSERT(exists(task), "task is required");
    ASSERT(Array.isArray(task.instances), "task.instances must be an array");
    if (task.instances.length === 0) {
        return false;
    }

    for (let inst of task.instances) {
        ASSERT(typeof inst.recurring === "boolean", "inst.recurring must be a boolean");

        if (!inst.recurring) {
            ASSERT(exists(inst.date), "inst.date is required for non-recurring");
            ASSERT(Array.isArray(inst.completion), "inst.completion must be an array");
            let dt = DateTime.fromISO(inst.date);
            ASSERT(dt.isValid, `Invalid inst.date: ${inst.date}`);
            let targetTs = dt.startOf('day').toMillis();
            if (exists(inst.dueTime)) {
                let [hh, mm] = inst.dueTime.split(':').map(Number);
                targetTs = dt.set({hour: hh, minute: mm}).toMillis();
            }
            let found = inst.completion.some(ct => {
                let cd = DateTime.fromMillis(ct);
                return cd.hasSame(DateTime.fromMillis(targetTs).startOf('day'), 'day');
            });
            if (!found) {
                return false;
            }
        } else {
            ASSERT(exists(inst.range), "inst.range is required for recurring");
            let patternDates;
            if (inst.range.kind === 'dateRange') {
                ASSERT(exists(inst.range.dateRange.start) && exists(inst.range.dateRange.end),
                       "Both start and end are required for dateRange");
                let startMs = DateTime.fromISO(inst.range.dateRange.start).startOf('day').toMillis();
                let endMs   = DateTime.fromISO(inst.range.dateRange.end).endOf('day').toMillis();
                patternDates = generateInstancesFromPattern(inst, startMs, endMs);
            } else if (inst.range.kind === 'recurrenceCount') {
                ASSERT(typeof inst.range.recurrenceCount === 'number' && inst.range.recurrenceCount > 0,
                       "range.recurrenceCount must be a positive integer");
                patternDates = generateInstancesFromPattern(inst);
                ASSERT(patternDates.length === inst.range.recurrenceCount,
                       "Pattern count does not match recurrenceCount");
            } else {
                ASSERT(false, `Unknown inst.range.kind: ${inst.range.kind}`);
            }

            ASSERT(Array.isArray(inst.completion), "inst.completion must be an array");
            for (let pd of patternDates) {
                let pdDay = DateTime.fromMillis(pd).startOf('day');
                let ok = inst.completion.some(ct => {
                    return DateTime.fromMillis(ct).hasSame(pdDay, 'day');
                });
                if (!ok) {
                    return false;
                }
            }
        }
    }

    return true;
}

function renderDay(day, element, index) {
    // get existing element
    ASSERT(day != undefined && day != null, "renderDay day is undefined or null");
    ASSERT(day instanceof DateField, "day must be a DateField");
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
                    zIndex: 400
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
    // task due dates don't go on the calendar but work times do
    // filter by not on this day and expand recurring into what's on this day
    /*
        filtered instance {
            start: int unix time,
            end: int unix time,
            wrapToPreviousDay: true/false, // optional, is this a multi-day event that wraps to the previous day
            wrapToNextDay: true/false, // optional, is this a multi-day event that wraps to the next day
            completeTask: true/false, // is this work time on a task that's been completed
        }
        filtered all day instance {
            startDate: DateField,
            faded: true/false
        }
    */
    // get unix start and end of day with user's offsets
    // Convert DateField to DateTime
    let dayDateTime = DateTime.local(day.year, day.month, day.day);
    let startOfDay = dayDateTime.startOf('day').plus({hours: user.settings.startOfDayOffset});
    startOfDay = startOfDay.toMillis(); // unix
    let endOfDay = dayDateTime.endOf('day').plus({hours: user.settings.endOfDayOffset});
    endOfDay = endOfDay.toMillis() + 1; // +1 to include the end of the day

    let filteredInstances = [];
    let filteredAllDayInstances = [];
    for (let obj of user.taskEventArray) {
        if (obj.kind == 'task') {
            // AI AUDIT NEEDED
            // Handle task work times
            if (exists(obj.task.workTimes)) {
                for (let workTime of obj.task.workTimes) {
                    if (!exists(workTime.startTime)) {
                        // All day work session
                        let workDate;
                        
                        if (!workTime.recurring) {
                            workDate = DateTime.fromISO(workTime.startDate);
                            
                            // Check if this all-day work session falls on the current day
                            if (workDate.toISODate() === dayDateTime.toISODate()) {
                                filteredAllDayInstances.push({
                                    startDate: workDate,
                                    faded: false
                                });
                            }
                        } else {
                            // Recurring all-day work session
                            // Calculate day boundaries for pattern matching
                            let dayStartMs = DateTime.fromISO(dayDateTime).startOf('day').toMillis();
                            let dayEndMs = DateTime.fromISO(dayDateTime).endOf('day').toMillis();
                            
                            // Generate all instances for this day using the helper
                            let patternDates = generateInstancesFromPattern(workTime, dayStartMs, dayEndMs);
                            
                            if (patternDates.length > 0) {
                                filteredAllDayInstances.push({
                                    startDate: dayDateTime,
                                    faded: false
                                });
                            }
                        }
                        continue;
                    }
                    
                    // Handle timed work sessions
                    if (!workTime.recurring) {
                        // Non-recurring work session - simple case
                        let workStart = DateTime.fromISO(workTime.startDate);
                        workStart = workStart.plus({
                            hours: parseInt(workTime.startTime.split(':')[0]),
                            minutes: parseInt(workTime.startTime.split(':')[1])
                        });
                        
                        let workEnd;
                        if (exists(workTime.differentEndDate)) {
                            // Different end date
                            workEnd = DateTime.fromISO(workTime.differentEndDate);
                        } else {
                            // Same end date as start
                            workEnd = DateTime.fromISO(workTime.startDate);
                        }
                        
                        workEnd = workEnd.plus({
                            hours: parseInt(workTime.endTime.split(':')[0]),
                            minutes: parseInt(workTime.endTime.split(':')[1])
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
                                completeTask: isTaskComplete(obj.task)
                            });
                        }
                    } else {
                        // Recurring work session - use pattern helper
                        // Include a wider time range to catch wrap-around events
                        let dayBeforeMs = DateTime.fromISO(dayDateTime).minus({days: 1}).startOf('day').toMillis();
                        let dayAfterMs = DateTime.fromISO(dayDateTime).plus({days: 1}).endOf('day').toMillis();
                        
                        // Generate all instances from the pattern
                        let patternStartTimes = generateInstancesFromPattern(workTime, dayBeforeMs, dayAfterMs);
                        
                        // Process each instance
                        for (let startMs of patternStartTimes) {
                            let startTime = DateTime.fromMillis(startMs);
                            
                            // Calculate end time based on startTime and endTime fields
                            let endTime;
                            
                            if (exists(workTime.differentEndDatePattern) && workTime.differentEndDatePattern > 0) {
                                // Multi-day event using pattern
                                endTime = startTime.plus({days: workTime.differentEndDatePattern});
                            } else {
                                // Same day event
                                endTime = startTime;
                            }
                            
                            // Add the end time hours and minutes
                            endTime = endTime.plus({
                                hours: parseInt(workTime.endTime.split(':')[0]),
                                minutes: parseInt(workTime.endTime.split(':')[1])
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
                                    completeTask: isTaskComplete(obj.task)
                                });
                            }
                        }
                    }
                }
            }
        } else if (obj.kind == 'event') {
            // THIS BLOCK REQUIRES AUDIT OF AI CODE
            // Handle events similar to task work times but with some differences
            for (let instance of obj.event.instances) {
                if (!exists(instance.startTime)) {
                    // All day event
                    let eventDate;
                    
                    if (!instance.recurring) {
                        eventDate = DateTime.fromISO(instance.startDate);
                        
                        // Check if the event falls on this day
                        if (eventDate.toISODate() === dayDateTime.toISODate()) {
                            filteredAllDayInstances.push({
                                startDate: eventDate,
                                faded: false
                            });
                        }
                    } else {
                        // Recurring all-day event
                        // Generate all instances of this pattern that fall on this day
                        let eventDayStart = DateTime.fromISO(dayDateTime).startOf('day').toMillis();
                        let eventDayEnd = DateTime.fromISO(dayDateTime).endOf('day').toMillis();
                        
                        // Use our helper function to get all instances on this day
                        let patternInstances = generateInstancesFromPattern(instance, eventDayStart, eventDayEnd);
                        
                        if (patternInstances.length > 0) {
                            // If any instance falls on this day, add it
                            filteredAllDayInstances.push({
                                startDate: dayDateTime,
                                faded: false
                            });
                        }
                    }
                } else if (!instance.recurring) {
                    // Event with specific time
                    let eventStart, eventEnd;

                    // Non-recurring event
                    eventStart = DateTime.fromISO(instance.startDate);
                    eventStart = eventStart.plus({
                        hours: parseInt(instance.startTime.split(':')[0]), 
                        minutes: parseInt(instance.startTime.split(':')[1])
                    }).toMillis();
                    
                    // Handle event end time
                    if (exists(instance.endTime)) {
                        if (exists(instance.differentEndDate)) {
                            // Multi-day event
                            eventEnd = DateTime.fromISO(instance.differentEndDate);
                        } else {
                            // Same day event
                            eventEnd = DateTime.fromISO(instance.startDate);
                        }
                        
                        eventEnd = eventEnd.plus({
                            hours: parseInt(instance.endTime.split(':')[0]), 
                            minutes: parseInt(instance.endTime.split(':')[1])
                        }).toMillis();
                    } else {
                        // Default to 1 hour if no end time specified
                        eventEnd = DateTime.fromMillis(eventStart).plus({hours: 1}).toMillis();
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
                    let dayBefore = DateTime.fromISO(dayDateTime).minus({days: 1}).startOf('day').toMillis();
                    let dayAfter = DateTime.fromISO(dayDateTime).plus({days: 1}).endOf('day').toMillis();
                    
                    // We look at a wider range to catch events that wrap from previous/to next day
                    let patternInstances = generateInstancesFromPattern(instance, dayBefore, dayAfter);
                    
                    for (let patternStart of patternInstances) {
                        // Calculate event end based on start
                        let patternEnd;
                        
                        if (exists(instance.endTime)) {
                            // Calculate hours/minutes difference between start and end times
                            let startHours = parseInt(instance.startTime.split(':')[0]);
                            let startMinutes = parseInt(instance.startTime.split(':')[1]);
                            let endHours = parseInt(instance.endTime.split(':')[0]);
                            let endMinutes = parseInt(instance.endTime.split(':')[1]);
                            
                            // Calculate duration
                            let durationHours = endHours - startHours;
                            let durationMinutes = endMinutes - startMinutes;
                            if (durationMinutes < 0) {
                                durationHours--;
                                durationMinutes += 60;
                            }
                            
                            patternEnd = DateTime.fromMillis(patternStart)
                                .plus({hours: durationHours, minutes: durationMinutes}).toMillis();
                        } else {
                            // Default 1 hour duration
                            patternEnd = DateTime.fromMillis(patternStart).plus({hours: 1}).toMillis();
                        }
                        
                        // If there's a differentEndDatePattern, adjust the end date
                        if (exists(instance.differentEndDatePattern)) {
                            patternEnd = DateTime.fromMillis(patternStart)
                                .plus({days: instance.differentEndDatePattern})
                                .set({
                                    hour: parseInt(instance.endTime.split(':')[0]),
                                    minute: parseInt(instance.endTime.split(':')[1])
                                }).toMillis();
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
        } else {
            ASSERT(false, "Unknown kind of task/event");
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
            backgroundColor: user.palette.shades[2],
            opacity: allDayEvent.faded ? 0.5 : 1,
            borderRadius: '3px',
            zIndex: 350
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
    ASSERT(exists(days) && Array.isArray(days) && exists(user.settings) && exists(user.settings.numberOfCalendarDays) && days.length == user.settings.numberOfCalendarDays, "renderCalendar days must be an array of length user.settings.numberOfCalendarDays");
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
            zIndex: 300 // below hour markers
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
            zIndex: 200, // below dayElement
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
            zIndex: 400
        });
        
        // Get the date components from DateField
        let day = days[i];
        ASSERT(day instanceof DateField, "day must be a DateField");
        
        let month = day.month;
        let dayOfMonth = day.day;
        
        // Format as M/D without leading zeros
        dateText.innerHTML = month + '/' + dayOfMonth;
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
            zIndex: 400
        });
        dayOfWeekText.innerHTML = dayOfWeekOrRelativeDay(day);
        if (dayOfWeekOrRelativeDay(day) == 'Today') {
            // white text for today
            HTML.setStyle(dateText, { color: user.palette.shades[4] });
            HTML.setStyle(dayOfWeekText, { color: user.palette.shades[4] });
        }
        HTML.body.appendChild(dayOfWeekText);

        renderDay(day, dayElement, i);
    }
}

function resizeListener() {
    columnWidth = ((window.innerWidth - (2*windowBorderMargin) - gapBetweenColumns*(numberOfColumns() - 1)) / numberOfColumns()); // 1 fewer gaps than columns
    ASSERT(!isNaN(columnWidth), "columnWidth must be a float");
    renderCalendar(currentDays());
}

function toggleNumberOfCalendarDays() {
    ASSERT(type(user.settings.numberOfCalendarDays, Int));
    ASSERT(1 <= user.settings.numberOfCalendarDays && user.settings.numberOfCalendarDays <= 7);
    
    // looping from 2 to 8 incrementing by 1
    if (user.settings.numberOfCalendarDays >= 7) {
        user.settings.numberOfCalendarDays = 1;
    } else {
        user.settings.numberOfCalendarDays++;
    }
    localStorage.setItem("userData", JSON.stringify(user));

    let buttonNumberCalendarDays = HTML.get('buttonNumberCalendarDays');
    buttonNumberCalendarDays.innerHTML = 'Toggle Number of Calendar Days: ' + user.settings.numberOfCalendarDays;
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
ASSERT(type(user.settings.numberOfCalendarDays, Int));
ASSERT(1 <= user.settings.numberOfCalendarDays && user.settings.numberOfCalendarDays <= 7);
buttonNumberCalendarDays.innerHTML = 'Toggle Number of Calendar Days: ' + user.settings.numberOfCalendarDays;
buttonNumberCalendarDays.onclick = toggleNumberOfCalendarDays;
HTML.body.appendChild(buttonNumberCalendarDays);

function toggleAmPmOr24() {
    ASSERT(exists(user.settings));
    ASSERT(user.settings.ampmOr24 == 'ampm' || user.settings.ampmOr24 == '24');
    if (user.settings.ampmOr24 == 'ampm') {
        user.settings.ampmOr24 = '24';
    } else {
        user.settings.ampmOr24 = 'ampm';
    }
    localStorage.setItem("userData", JSON.stringify(user));

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
    ASSERT(exists(user.settings));
    ASSERT(type(user.settings.stacking, Boolean));
    user.settings.stacking = !user.settings.stacking;
    localStorage.setItem("userData", JSON.stringify(user));
    resizeListener();
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

window.onresize = resizeListener;

// init call
user.firstDayInCalendar = getDay(0); // on page load we want to start with today (as DateField)
resizeListener();function ASSERT(condition, message="") {
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

const NULL = Symbol('NULL');

function exists(obj) {
    return obj != null && obj != undefined;
}

// async/await sleep function like Python's
function sleep(seconds) {
    return new Promise(resolve => setTimeout(resolve, seconds * 1000)); // setTimeout works in milliseconds
}

// List type for homogeneous arrays
class List {
    constructor(innerType) {
        ASSERT(exists(innerType));
        // innerType can be a constructor or another List
        ASSERT(typeof innerType === 'function' || innerType instanceof List);
        this.innertype = innerType;
    }
}

// Convenience alias for creating list type without 'new'
function LIST(innerType) {
    return new List(innerType);
}