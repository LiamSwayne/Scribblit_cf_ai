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

// Date and Time
class DateField {
    constructor(year, month, day) {
        this.year = year;
        this.month = month;
        this.day = day;
    }
}

class TimeField {
    constructor(hour, minute) {
        this.hour = hour;
        this.minute = minute;
    }
}

// Recurrence patterns
class EveryNDaysPattern {
    constructor(initialDate, n) {
        this.initialDate = initialDate; // DateField
        this.n = n;
    }
}

class MonthlyPattern {
    constructor(day) {
        this.day = day;
    }
}

class AnnuallyPattern {
    constructor(month, day) {
        this.month = month;
        this.day = day;
    }
}

// Range specs
class DateRange {
    constructor(startDate, endDate) {
        this.startDate = startDate; // DateField
        this.endDate = endDate;     // DateField
    }
}

class RecurrenceCount {
    constructor(count) {
        this.count = count; // int
    }
}

// Task instances
class NonRecurringTaskInstance {
    constructor(date, dueTime, completion) {
        this.date = date;         // DateField
        this.dueTime = dueTime;   // TimeField
        this.completion = completion; // array of Unix timestamps
    }
}

class RecurringTaskInstance {
    constructor(datePattern, dueTime, range, completion) {
        this.datePattern = datePattern; // EveryNDaysPattern, MonthlyPattern, or AnnuallyPattern
        this.dueTime = dueTime;         // TimeField
        this.range = range;             // DateRange or RecurrenceCount
        this.completion = completion;   // array of Unix timestamps
    }
}

// Event instances
class NonRecurringEventInstance {
    constructor(startDate, startTime, endTime, differentEndDate = null) {
        this.startDate = startDate;         // DateField
        this.startTime = startTime;         // TimeField
        this.endTime = endTime;             // TimeField
        this.differentEndDate = differentEndDate; // DateField or null
    }
}

class RecurringEventInstance {
    constructor(startDatePattern, startTime, endTime, range, differentEndDatePattern = null) {
        this.startDatePattern = startDatePattern; // EveryNDaysPattern, MonthlyPattern, or AnnuallyPattern
        this.startTime = startTime;               // TimeField
        this.endTime = endTime;                   // TimeField
        this.range = range;                       // DateRange or RecurrenceCount
        this.differentEndDatePattern = differentEndDatePattern; // int (days after start)
    }
}

// TaskData and EventData
class TaskData {
    constructor(instances, hideUntil, showOverdue, workSessions) {
        this.instances = instances;  // array of NonRecurringTaskInstance or RecurringTaskInstance
        this.hideUntil = hideUntil;  // { kind: 'dayOf' | 'relative' | 'date', value: int or DateField }
        this.showOverdue = showOverdue; // boolean
        this.workSessions = workSessions; // array of NonRecurringEventInstance or RecurringEventInstance
    }
}

class EventData {
    constructor(instances) {
        this.instances = instances; // array of NonRecurringEventInstance or RecurringEventInstance
    }
}

// Task or Event container
class TaskOrEvent {
    constructor(id, name, description, data) {
        this.id = id;           // string
        this.name = name;       // string
        this.description = description; // string
        this.data = data;       // TaskData or EventData
    }
}
