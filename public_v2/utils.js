let TESTING = true;

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

const NULL = Symbol('NULL');
const Int = Symbol('Int'); // Symbol for integer type checking
const Type = Symbol('Type'); // Meta type to represent valid types
const NonEmptyString = Symbol('NonEmptyString'); // Symbol for non-empty string type checking

function exists(obj) {
    return obj != null && obj != undefined;
}

// async/await sleep function like Python's
function sleep(seconds) {
    return new Promise(resolve => setTimeout(resolve, seconds * 1000)); // setTimeout works in milliseconds
}

// List type for homogeneous arrays
class LIST {
    constructor(innerType) {
        ASSERT(exists(innerType));
        // Validate that innerType is a valid type
        ASSERT(type(innerType, Type), "LIST constructor requires a valid type parameter");
        this.innertype = innerType;
    }
}

// Convenience alias for creating list type without 'new'
function List(innerType) {
    return new LIST(innerType);
}

// Dict type for heterogeneous key-value collections
class DICT {
    constructor(keyType, valueType) {
        ASSERT(exists(keyType));
        ASSERT(exists(valueType));
        // Validate that both types are valid
        ASSERT(type(keyType, Type), "DICT constructor requires a valid keyType parameter");
        ASSERT(type(valueType, Type), "DICT constructor requires a valid valueType parameter");
        this.keyType = keyType;
        this.valueType = valueType;
    }
}

// Convenience alias for creating dict type without 'new'
function Dict(keyType, valueType) {
    return new DICT(keyType, valueType);
}

// Union type for supporting type1 OR type2 OR ...
class UNION {
    constructor(...types) {
        ASSERT(types.length >= 2, "UNION requires at least 2 types");
        types.forEach(t => {
            ASSERT(exists(t));
            ASSERT(type(t, Type), "UNION constructor requires valid type parameters");
        });
        this.types = types;
    }
}

// Convenience alias for creating union type without 'new'
function Union(...types) {
    return new UNION(...types);
}

function log(message) {
    if (TESTING) {
        console.log(message);
    }
}

// Date
class DateField {
    constructor(year, month, day) {
        ASSERT(type(year, Int));
        
        ASSERT(type(month, Int));
        ASSERT(month >= 1 && month <= 12);
        
        ASSERT(type(day, Int));
        ASSERT(day >= 1 && day <= 31);
        
        // Additional validation for days in month (including leap years)
        const daysInMonth = new Date(year, month, 0).getDate();
        ASSERT(day <= daysInMonth);
        
        this.year = year;
        this.month = month;
        this.day = day;
        this._type = 'DateField';
    }

    toJson() {
        ASSERT(type(this, DateField));
        return {
            year: this.year,
            month: this.month,
            day: this.day,
            _type: this._type
        };
    }

    static fromJson(json) {
        ASSERT(exists(json));
        return new DateField(json.year, json.month, json.day);
    }

    static fromYYYY_MM_DD(dateString) {
        // assertions
        ASSERT(type(dateString, NonEmptyString));
        ASSERT(dateString.length === 10);
        ASSERT(dateString[4] === '-' && dateString[7] === '-');
        const parts = dateString.split('-');
        return new DateField(Number(parts[0]), Number(parts[1]), Number(parts[2]));
    }
}

// Time
class TimeField {
    constructor(hour, minute) {
        ASSERT(type(hour, Int));
        ASSERT(hour >= 0 && hour <= 23);
        
        ASSERT(type(minute, Int));
        ASSERT(minute >= 0 && minute <= 59);
        
        this.hour = hour;
        this.minute = minute;
        this._type = 'TimeField';
    }

    toJson() {
        ASSERT(type(this, TimeField));
        return {
            hour: this.hour,
            minute: this.minute,
            _type: this._type
        };
    }

    static fromJson(json) {
        ASSERT(exists(json));
        return new TimeField(json.hour, json.minute);
    }
}

// Recurrence patterns
class EveryNDaysPattern {
    constructor(initialDate, n) {
        ASSERT(type(initialDate, DateField));
        
        ASSERT(type(n, Int));
        ASSERT(n > 0);
        
        this.initialDate = initialDate;
        this.n = n;
        this._type = 'EveryNDaysPattern';
    }

    toJson() {
        ASSERT(type(this, EveryNDaysPattern));
        return {
            initialDate: this.initialDate.toJson(),
            n: this.n,
            _type: this._type
        };
    }

    static fromJson(json) {
        ASSERT(exists(json));
        return new EveryNDaysPattern(DateField.fromJson(json.initialDate), json.n);
    }
}

// Represents hiding a task until a certain number of days before it's due
// Applies to each instance of a task
// for recurring it applies to each instance, not the pattern
class HideUntilRelative {
    constructor(value) {
        ASSERT(type(value, Int), "HideUntilRelative: value must be an Integer.");
        ASSERT(value > 0, "HideUntilRelative: value must be greater than 0.");
        this.value = value;
        this._type = 'HideUntilRelative';
    }

    toJson() {
        ASSERT(type(this, HideUntilRelative));
        return {
            value: this.value,
            _type: this._type
        };
    }

    static fromJson(json) {
        ASSERT(exists(json));
        return new HideUntilRelative(json.value);
    }
}

// Represents hiding a task until a specific calendar date.
class HideUntilDate {
    constructor(date) {
        ASSERT(type(date, DateField), "HideUntilDate: value must be a DateField.");
        this.date = date;
    }
}

// hide until the day the task is due
const HideUntilDayOf = Symbol('HideUntilDayOf');

class MonthlyPattern {
    constructor(day) {
        ASSERT(type(day, Int));
        ASSERT(day >= 1 && day <= 31);
        
        this.day = day;
    }
}

class AnnuallyPattern {
    constructor(month, day) {
        ASSERT(type(month, Int));
        ASSERT(month >= 1 && month <= 12);
        
        ASSERT(type(day, Int));
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
        ASSERT(type(startDate, DateField));
        
        // endDate can be NULL (optional)
        if (endDate !== NULL) {
            ASSERT(type(endDate, DateField));
            
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
        ASSERT(type(count, Int));
        ASSERT(count > 0);
        
        this.count = count;
    }
}

// Task instances
class NonRecurringTaskInstance {
    constructor(date, dueTime, completion) {
        ASSERT(type(date, DateField));
        
        // dueTime can be NULL (optional)
        if (dueTime !== NULL) {
            ASSERT(type(dueTime, TimeField));
        }
        
        ASSERT(type(completion, List(Int)));
        
        this.date = date;
        this.dueTime = dueTime;
        this.completion = completion;
    }
}

class RecurringTaskInstance {
    constructor(datePattern, dueTime, range, completion) {
        ASSERT(type(datePattern, Union(EveryNDaysPattern, MonthlyPattern, AnnuallyPattern)));
        
        // dueTime can be NULL (optional)
        if (dueTime !== NULL) {
            ASSERT(type(dueTime, TimeField));
        }
        
                ASSERT(type(range, Union(DateRange, RecurrenceCount)));
        
        ASSERT(type(completion, List(Int)));
        
        this.datePattern = datePattern;
        this.dueTime = dueTime;
        this.range = range;
        this.completion = completion;
    }
}

// Event instances
class NonRecurringEventInstance {
    constructor(startDate, startTime, endTime, differentEndDate) {
        ASSERT(type(startDate, DateField));
        
        // startTime and endTime can be NULL (optional)
        if (startTime !== NULL) {
            ASSERT(type(startTime, TimeField));
        }
        
        if (endTime !== NULL) {
            ASSERT(type(endTime, TimeField));
            
            // If both start and end times are provided, validate end is after start on same day
            if (startTime !== NULL && differentEndDate === NULL) {
                const startMinutes = startTime.hour * 60 + startTime.minute;
                const endMinutes = endTime.hour * 60 + endTime.minute;
                ASSERT(endMinutes > startMinutes);
            }
        }
        
        // differentEndDate is optional
        if (differentEndDate !== NULL) {
            ASSERT(type(differentEndDate, DateField));
            
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
    constructor(startDatePattern, startTime, endTime, range, differentEndDatePattern) {
        ASSERT(type(startDatePattern, Union(EveryNDaysPattern, MonthlyPattern, AnnuallyPattern)));
        
        // startTime and endTime can be NULL (optional)
        if (startTime !== NULL) {
            ASSERT(type(startTime, TimeField));
        }
        
        if (endTime !== NULL) {
            ASSERT(type(endTime, TimeField));
            
            // If both start and end times are provided, validate end is after start on same day (if not multi-day)
            if (startTime !== NULL && differentEndDatePattern === NULL) {
                const startMinutes = startTime.hour * 60 + startTime.minute;
                const endMinutes = endTime.hour * 60 + endTime.minute;
                ASSERT(endMinutes > startMinutes);
            }
        }
        
        ASSERT(type(range, Union(DateRange, RecurrenceCount)));
        
        // differentEndDatePattern (optional) is the number of days after each start date to end the event
        if (differentEndDatePattern !== NULL) {
            ASSERT(type(differentEndDatePattern, Int));
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
        // Check instances is a list of either NonRecurringTaskInstance or RecurringTaskInstance
        ASSERT(type(instances, List(Union(NonRecurringTaskInstance, RecurringTaskInstance))));
        ASSERT(type(hideUntil, Union(NULL, HideUntilRelative, HideUntilDate, HideUntilDayOf)));
        
        ASSERT(type(showOverdue, Boolean));
        
        // workSessions is optional
        if (workSessions !== NULL) {
            ASSERT(type(workSessions, List(Union(NonRecurringEventInstance, RecurringEventInstance))));
        }
        
        this.instances = instances;
        this.hideUntil = hideUntil;
        this.showOverdue = showOverdue;
        this.workSessions = workSessions;
    }
}

class EventData {
    constructor(instances) {
        console.log("EventData constructor received instances:", instances);
        ASSERT(type(instances, List(Union(NonRecurringEventInstance, RecurringEventInstance))));
        
        this.instances = instances;
    }
}

// Task or Event container, the uppermost level of the data structure
class TaskOrEvent {
    constructor(id, name, description, data) {
        ASSERT(type(id, NonEmptyString));
        
        ASSERT(type(name, NonEmptyString));
        
        // description is optional
        if (description !== NULL) {
            ASSERT(type(description, String));
        }
        
        ASSERT(type(data, Union(TaskData, EventData)));
        
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
    if (sometype === NULL) {
        return thing === NULL;
    } else if (sometype instanceof LIST) {
        if (!Array.isArray(thing)) return false;
        for (const elem of thing) {
            if (!type(elem, sometype.innertype)) return false;
        }
        return true;
    } else if (sometype instanceof DICT) {
        if (typeof thing !== 'object' || thing === null || Array.isArray(thing)) return false;
        for (const key in thing) {
            if (!type(key, sometype.keyType)) return false;
            if (!type(thing[key], sometype.valueType)) return false;
        }
        return true;
    } else if (sometype instanceof UNION) {
        for (const unionType of sometype.types) {
            if (type(thing, unionType)) return true;
        }
        return false;
    } else if (sometype === Type) {
        return typeof thing === 'function' || typeof thing === 'symbol' || thing instanceof LIST || thing instanceof DICT || thing instanceof UNION;
    } else if (sometype === Int) {
        return typeof thing === 'number' && Number.isInteger(thing);
    } else if (sometype === NonEmptyString) {
        return typeof thing === 'string' && thing.length > 0;
    } else if (sometype === DateField) {
        try { new DateField(thing.year, thing.month, thing.day); return true; } catch (e) { return false; }
    } else if (sometype === TimeField) {
        try { new TimeField(thing.hour, thing.minute); return true; } catch (e) { return false; }
    } else if (sometype === EveryNDaysPattern) {
        try { new EveryNDaysPattern(thing.initialDate, thing.n); return true; } catch (e) { return false; }
    } else if (sometype === MonthlyPattern) {
        try { new MonthlyPattern(thing.day); return true; } catch (e) { return false; }
    } else if (sometype === AnnuallyPattern) {
        try { new AnnuallyPattern(thing.month, thing.day); return true; } catch (e) { return false; }
    } else if (sometype === DateRange) {
        try { new DateRange(thing.startDate, thing.endDate); return true; } catch (e) { return false; }
    } else if (sometype === RecurrenceCount) {
        try { new RecurrenceCount(thing.count); return true; } catch (e) { return false; }
    } else if (sometype === NonRecurringTaskInstance) {
        try { new NonRecurringTaskInstance(thing.date, thing.dueTime, thing.completion); return true; } catch (e) { return false; }
    } else if (sometype === RecurringTaskInstance) {
        try { new RecurringTaskInstance(thing.datePattern, thing.dueTime, thing.range, thing.completion); return true; } catch (e) { return false; }
    } else if (sometype === NonRecurringEventInstance) {
        try { new NonRecurringEventInstance(thing.startDate, thing.startTime, thing.endTime, thing.differentEndDate); return true; } catch (e) { return false; }
    } else if (sometype === RecurringEventInstance) {
        try { new RecurringEventInstance(thing.startDatePattern, thing.startTime, thing.endTime, thing.range, thing.differentEndDatePattern); return true; } catch (e) { return false; }
    } else if (sometype === TaskData) {
        try { new TaskData(thing.instances, thing.hideUntil, thing.showOverdue, thing.workSessions); return true; } catch (e) { return false; }
    } else if (sometype === EventData) {
        try { new EventData(thing.instances); return true; } catch (e) { return false; }
    } else if (sometype === TaskOrEvent) {
        try { new TaskOrEvent(thing.id, thing.name, thing.description, thing.data); return true; } catch (e) { return false; }
    }
    // Primitive type checks
    else if (sometype === Number) return typeof thing === 'number';
    else if (sometype === String) return typeof thing === 'string';
    else if (sometype === Boolean) return typeof thing === 'boolean';
    else if (sometype === Symbol) return typeof thing === 'symbol';
    else if (sometype === BigInt) return typeof thing === 'bigint';
    // String format symbols for date components
    // these are just symbols, so the validation is done in the type checking function
    else if (sometype === YYYY_MM_DD) {
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
    } else if (sometype === YYYY) {
        if (typeof thing !== 'string' || thing.length !== 4) return false;
        const y = Number(thing);
        if (!Number.isInteger(y)) return false;
        return true;
    } else if (sometype === MM) {
        if (typeof thing !== 'string' || thing.length !== 2) return false;
        const m = Number(thing);
        if (!Number.isInteger(m) || m < 1 || m > 12) return false;
        return true;
    } else if (sometype === DD) {
        if (typeof thing !== 'string' || thing.length !== 2) return false;
        const d = Number(thing);
        if (!Number.isInteger(d) || d < 1 || d > 31) return false;
        return true;
    } else if (sometype === DAY_OF_WEEK) {
        if (typeof thing !== 'string') return false;
        const dow = thing;
        const valid = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
        return valid.includes(dow);
    } else {
        return thing instanceof sometype;
    }
}