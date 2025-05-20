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

// Dict type for heterogeneous key-value collections
class Dict {
    constructor(keyType, valueType) {
        ASSERT(exists(keyType));
        ASSERT(exists(valueType));
        // keyType and valueType can be a constructor or another List/Dict
        ASSERT(typeof keyType === 'function' || keyType instanceof List || keyType instanceof Dict);
        ASSERT(typeof valueType === 'function' || valueType instanceof List || valueType instanceof Dict);
        this.keyType = keyType;
        this.valueType = valueType;
    }
}

// Convenience alias for creating dict type without 'new'
function DICT(keyType, valueType) {
    return new Dict(keyType, valueType);
}

// Union type for supporting type1 OR type2 OR ...
class Union {
    constructor(...types) {
        ASSERT(types.length >= 2);
        types.forEach(t => ASSERT(exists(t)));
        this.types = types;
    }
}

// Convenience alias for creating union type without 'new'
function UNION(...types) {
    return new Union(...types);
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
        ASSERT(type(hour, Int));
        ASSERT(hour >= 0 && hour <= 23);
        
        ASSERT(type(minute, Int));
        ASSERT(minute >= 0 && minute <= 59);
        
        this.hour = hour;
        this.minute = minute;
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
    }
}

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
        
        ASSERT(type(completion, LIST(Int)));
        
        this.date = date;
        this.dueTime = dueTime;
        this.completion = completion;
    }
}

class RecurringTaskInstance {
    constructor(datePattern, dueTime, range, completion) {
        ASSERT(type(datePattern, UNION(EveryNDaysPattern, MonthlyPattern, AnnuallyPattern)));
        
        // dueTime can be NULL (optional)
        if (dueTime !== NULL) {
            ASSERT(type(dueTime, TimeField));
        }
        
                ASSERT(type(range, UNION(DateRange, RecurrenceCount)));
        
        ASSERT(type(completion, LIST(Int)));
        
        this.datePattern = datePattern;
        this.dueTime = dueTime;
        this.range = range;
        this.completion = completion;
    }
}

// Event instances
class NonRecurringEventInstance {
    constructor(startDate, startTime, endTime, differentEndDate = NULL) {
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
    constructor(startDatePattern, startTime, endTime, range, differentEndDatePattern = NULL) {
        ASSERT(type(startDatePattern, UNION(EveryNDaysPattern, MonthlyPattern, AnnuallyPattern)));
        
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
        
        ASSERT(type(range, UNION(DateRange, RecurrenceCount)));
        
        // differentEndDatePattern is optional
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
        ASSERT(type(instances, LIST(UNION(NonRecurringTaskInstance, RecurringTaskInstance))));
        
        // hideUntil is optional
        if (hideUntil !== NULL) {
            ASSERT(type(hideUntil.kind, String));
            ASSERT(['dayOf', 'relative', 'date'].includes(hideUntil.kind));
            
            if (hideUntil.kind === 'relative') {
                ASSERT(type(hideUntil.value, Int));
            } else if (hideUntil.kind === 'date') {
                ASSERT(type(hideUntil.value, DateField));
            }
        }
        
        ASSERT(type(showOverdue, Boolean));
        
        // workSessions is optional
        if (workSessions !== NULL) {
            ASSERT(type(workSessions, LIST(UNION(NonRecurringEventInstance, RecurringEventInstance))));
        }
        
        this.instances = instances;
        this.hideUntil = hideUntil;
        this.showOverdue = showOverdue;
        this.workSessions = workSessions;
    }
}

class EventData {
    constructor(instances) {
        ASSERT(type(instances, LIST(UNION(NonRecurringEventInstance, RecurringEventInstance))));
        
        this.instances = instances;
    }
}

// Task or Event container, the uppermost level of the data structure
class TaskOrEvent {
    constructor(id, name, description, data) {
        ASSERT(type(id, String));
        ASSERT(id.length > 0);
        
        ASSERT(type(name, String));
        ASSERT(name.length > 0);
        
        // description is optional
        if (description !== NULL) {
            ASSERT(type(description, String));
        }
        
        ASSERT(type(data, UNION(TaskData, EventData)));
        
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
    // Dict type handling
    if (sometype instanceof Dict) {
        if (typeof thing !== 'object' || thing === null || Array.isArray(thing)) return false;
        for (const key in thing) {
            if (!type(key, sometype.keyType)) return false;
            if (!type(thing[key], sometype.valueType)) return false;
        }
        return true;
    }
    // Union type handling
    if (sometype instanceof Union) {
        for (const unionType of sometype.types) {
            if (type(thing, unionType)) return true;
        }
        return false;
    }
    // Integer type check
    if (sometype === Int) {
        return typeof thing === 'number' && Number.isInteger(thing);
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
}