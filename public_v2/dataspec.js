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
}

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

// Task or Event container
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