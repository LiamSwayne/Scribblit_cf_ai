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
    }

    toJson() {
        ASSERT(type(this, DateField));
        return {
            year: this.year,
            month: this.month,
            day: this.day,
            _type: 'DateField'
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
    }

    toJson() {
        ASSERT(type(this, TimeField));
        return {
            hour: this.hour,
            minute: this.minute,
            _type: 'TimeField'
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
    }

    toJson() {
        ASSERT(type(this, EveryNDaysPattern));
        return {
            initialDate: this.initialDate.toJson(),
            n: this.n,
            _type: 'EveryNDaysPattern'
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
    }

    toJson() {
        ASSERT(type(this, HideUntilRelative));
        return {
            value: this.value,
            _type: 'HideUntilRelative'
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

    toJson() {
        ASSERT(type(this, HideUntilDate));
        return {
            date: this.date.toJson(),
            _type: 'HideUntilDate'
        };
    }

    static fromJson(json) {
        ASSERT(exists(json));
        return new HideUntilDate(DateField.fromJson(json.date));
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

    toJson() {
        ASSERT(type(this, MonthlyPattern));
        return {
            day: this.day,
            _type: 'MonthlyPattern'
        };
    }

    static fromJson(json) {
        ASSERT(exists(json));
        return new MonthlyPattern(json.day);
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

    toJson() {
        ASSERT(type(this, AnnuallyPattern));
        return {
            month: this.month,
            day: this.day,
            _type: 'AnnuallyPattern'
        };
    }

    static fromJson(json) {
        ASSERT(exists(json));
        return new AnnuallyPattern(json.month, json.day);
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

    toJson() {
        ASSERT(type(this, DateRange));
        let endDateJson;
        if (this.endDate === NULL) {
            endDateJson = NULL;
        } else {
            endDateJson = this.endDate.toJson();
        }
        return {
            startDate: this.startDate.toJson(),
            endDate: endDateJson,
            _type: 'DateRange'
        };
    }

    static fromJson(json) {
        ASSERT(exists(json));
        let endDate;
        if (json.endDate === NULL) {
            endDate = NULL;
        } else {
            endDate = DateField.fromJson(json.endDate);
        }
        return new DateRange(DateField.fromJson(json.startDate), endDate);
    }
}

class RecurrenceCount {
    constructor(count) {
        ASSERT(type(count, Int));
        ASSERT(count > 0);
        
        this.count = count;
    }

    toJson() {
        ASSERT(type(this, RecurrenceCount));
        return {
            count: this.count,
            _type: 'RecurrenceCount'
        };
    }

    static fromJson(json) {
        ASSERT(exists(json));
        return new RecurrenceCount(json.count);
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

    toJson() {
        ASSERT(type(this, NonRecurringTaskInstance));
        let dueTimeJson;
        if (this.dueTime === NULL) {
            dueTimeJson = NULL;
        } else {
            dueTimeJson = this.dueTime.toJson();
        }
        return {
            date: this.date.toJson(),
            dueTime: dueTimeJson,
            completion: this.completion,
            _type: 'NonRecurringTaskInstance'
        };
    }

    static fromJson(json) {
        ASSERT(exists(json));
        let dueTime;
        if (json.dueTime === NULL) {
            dueTime = NULL;
        } else {
            dueTime = TimeField.fromJson(json.dueTime);
        }
        return new NonRecurringTaskInstance(DateField.fromJson(json.date), dueTime, json.completion);
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

    toJson() {
        ASSERT(type(this, RecurringTaskInstance));
        let dueTimeJson;
        if (this.dueTime === NULL) {
            dueTimeJson = NULL;
        } else {
            dueTimeJson = this.dueTime.toJson();
        }
        return {
            datePattern: this.datePattern.toJson(),
            dueTime: dueTimeJson,
            range: this.range.toJson(),
            completion: this.completion,
            _type: 'RecurringTaskInstance'
        };
    }

    static fromJson(json) {
        ASSERT(exists(json));
        let dueTime;
        if (json.dueTime === NULL) {
            dueTime = NULL;
        } else {
            dueTime = TimeField.fromJson(json.dueTime);
        }
        
        let datePattern;
        if (json.datePattern._type === 'EveryNDaysPattern') {
            datePattern = EveryNDaysPattern.fromJson(json.datePattern);
        } else if (json.datePattern._type === 'MonthlyPattern') {
            datePattern = MonthlyPattern.fromJson(json.datePattern);
        } else if (json.datePattern._type === 'AnnuallyPattern') {
            datePattern = AnnuallyPattern.fromJson(json.datePattern);
        } else {
            ASSERT(false, 'Unknown datePattern type in RecurringTaskInstance.fromJson');
        }

        let range;
        if (json.range._type === 'DateRange') {
            range = DateRange.fromJson(json.range);
        } else if (json.range._type === 'RecurrenceCount') {
            range = RecurrenceCount.fromJson(json.range);
        } else {
            ASSERT(false, 'Unknown range type in RecurringTaskInstance.fromJson');
        }

        return new RecurringTaskInstance(datePattern, dueTime, range, json.completion);
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

    toJson() {
        ASSERT(type(this, NonRecurringEventInstance));
        let startTimeJson;
        if (this.startTime === NULL) {
            startTimeJson = NULL;
        } else {
            startTimeJson = this.startTime.toJson();
        }
        let endTimeJson;
        if (this.endTime === NULL) {
            endTimeJson = NULL;
        } else {
            endTimeJson = this.endTime.toJson();
        }
        let differentEndDateJson;
        if (this.differentEndDate === NULL) {
            differentEndDateJson = NULL;
        } else {
            differentEndDateJson = this.differentEndDate.toJson();
        }
        return {
            startDate: this.startDate.toJson(),
            startTime: startTimeJson,
            endTime: endTimeJson,
            differentEndDate: differentEndDateJson,
            _type: 'NonRecurringEventInstance'
        };
    }

    static fromJson(json) {
        ASSERT(exists(json));
        let startTime;
        if (json.startTime === NULL) {
            startTime = NULL;
        } else {
            startTime = TimeField.fromJson(json.startTime);
        }
        let endTime;
        if (json.endTime === NULL) {
            endTime = NULL;
        } else {
            endTime = TimeField.fromJson(json.endTime);
        }
        let differentEndDate;
        if (json.differentEndDate === NULL) {
            differentEndDate = NULL;
        } else {
            differentEndDate = DateField.fromJson(json.differentEndDate);
        }
        return new NonRecurringEventInstance(DateField.fromJson(json.startDate), startTime, endTime, differentEndDate);
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

    toJson() {
        ASSERT(type(this, RecurringEventInstance));
        let startTimeJson;
        if (this.startTime === NULL) {
            startTimeJson = NULL;
        } else {
            startTimeJson = this.startTime.toJson();
        }
        let endTimeJson;
        if (this.endTime === NULL) {
            endTimeJson = NULL;
        } else {
            endTimeJson = this.endTime.toJson();
        }
        return {
            startDatePattern: this.startDatePattern.toJson(),
            startTime: startTimeJson,
            endTime: endTimeJson,
            range: this.range.toJson(),
            differentEndDatePattern: this.differentEndDatePattern,
            _type: 'RecurringEventInstance'
        };
    }

    static fromJson(json) {
        ASSERT(exists(json));
        let startDatePattern;
        if (json.startDatePattern._type === 'EveryNDaysPattern') {
            startDatePattern = EveryNDaysPattern.fromJson(json.startDatePattern);
        } else if (json.startDatePattern._type === 'MonthlyPattern') {
            startDatePattern = MonthlyPattern.fromJson(json.startDatePattern);
        } else if (json.startDatePattern._type === 'AnnuallyPattern') {
            startDatePattern = AnnuallyPattern.fromJson(json.startDatePattern);
        } else {
            ASSERT(false, 'Unknown startDatePattern type in RecurringEventInstance.fromJson');
        }

        let startTime;
        if (json.startTime === NULL) {
            startTime = NULL;
        } else {
            startTime = TimeField.fromJson(json.startTime);
        }

        let endTime;
        if (json.endTime === NULL) {
            endTime = NULL;
        } else {
            endTime = TimeField.fromJson(json.endTime);
        }

        let range;
        if (json.range._type === 'DateRange') {
            range = DateRange.fromJson(json.range);
        } else if (json.range._type === 'RecurrenceCount') {
            range = RecurrenceCount.fromJson(json.range);
        } else {
            ASSERT(false, 'Unknown range type in RecurringEventInstance.fromJson');
        }
        
        // differentEndDatePattern can be NULL
        let differentEndDatePattern = NULL;
        if (json.differentEndDatePattern !== NULL) {
            differentEndDatePattern = json.differentEndDatePattern; 
        }

        return new RecurringEventInstance(startDatePattern, startTime, endTime, range, differentEndDatePattern);
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

    toJson() {
        ASSERT(type(this, TaskData));
        let instancesJson = [];
        for (const instance of this.instances) {
            instancesJson.push(instance.toJson());
        }
        let hideUntilJson;
        if (this.hideUntil === NULL || this.hideUntil === HideUntilDayOf) { // HideUntilDayOf is a Symbol, doesn't have toJson
            hideUntilJson = this.hideUntil;
        } else {
            hideUntilJson = this.hideUntil.toJson();
        }
        let workSessionsJson = NULL;
        if (this.workSessions !== NULL) {
            workSessionsJson = [];
            for (const session of this.workSessions) {
                workSessionsJson.push(session.toJson());
            }
        }
        return {
            instances: instancesJson,
            hideUntil: hideUntilJson,
            showOverdue: this.showOverdue,
            workSessions: workSessionsJson,
            _type: 'TaskData'
        };
    }

    static fromJson(json) {
        ASSERT(exists(json));
        let instances = [];
        for (const instanceJson of json.instances) {
            if (instanceJson._type === 'NonRecurringTaskInstance') {
                instances.push(NonRecurringTaskInstance.fromJson(instanceJson));
            } else if (instanceJson._type === 'RecurringTaskInstance') {
                instances.push(RecurringTaskInstance.fromJson(instanceJson));
            } else {
                ASSERT(false, 'Unknown instance type in TaskData.fromJson');
            }
        }
        let hideUntil;
        if (json.hideUntil === NULL || json.hideUntil === HideUntilDayOf) { // HideUntilDayOf is a Symbol
             hideUntil = json.hideUntil;
        } else if (json.hideUntil._type === 'HideUntilRelative') {
            hideUntil = HideUntilRelative.fromJson(json.hideUntil);
        } else if (json.hideUntil._type === 'HideUntilDate') {
            hideUntil = HideUntilDate.fromJson(json.hideUntil);
        } else {
            ASSERT(false, 'Unknown hideUntil type in TaskData.fromJson');
        }
        let workSessions = NULL;
        if (json.workSessions !== NULL) {
            workSessions = [];
            for (const sessionJson of json.workSessions) {
                if (sessionJson._type === 'NonRecurringEventInstance') {
                    workSessions.push(NonRecurringEventInstance.fromJson(sessionJson));
                } else if (sessionJson._type === 'RecurringEventInstance') {
                    workSessions.push(RecurringEventInstance.fromJson(sessionJson));
                } else {
                    ASSERT(false, 'Unknown workSession type in TaskData.fromJson');
                }
            }
        }
        return new TaskData(instances, hideUntil, json.showOverdue, workSessions);
    }
}

class EventData {
    constructor(instances) {
        console.log("EventData constructor received instances:", instances);
        ASSERT(type(instances, List(Union(NonRecurringEventInstance, RecurringEventInstance))));
        
        this.instances = instances;
    }

    toJson() {
        ASSERT(type(this, EventData));
        let instancesJson = [];
        for (const instance of this.instances) {
            instancesJson.push(instance.toJson());
        }
        return {
            instances: instancesJson,
            _type: 'EventData'
        };
    }

    static fromJson(json) {
        ASSERT(exists(json));
        let instances = [];
        for (const instanceJson of json.instances) {
            if (instanceJson._type === 'NonRecurringEventInstance') {
                instances.push(NonRecurringEventInstance.fromJson(instanceJson));
            } else if (instanceJson._type === 'RecurringEventInstance') {
                instances.push(RecurringEventInstance.fromJson(instanceJson));
            } else {
                ASSERT(false, 'Unknown instance type in EventData.fromJson');
            }
        }
        return new EventData(instances);
    }
}

// Task or Event container, the uppermost level of the data structure
class Entity {
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

    toJson() {
        ASSERT(type(this, Entity));
        return {
            id: this.id,
            name: this.name,
            description: this.description,
            data: this.data.toJson(),
            _type: 'TaskOrEvent'
        };
    }

    static fromJson(json) {
        ASSERT(exists(json));
        let data;
        if (json.data._type === 'TaskData') {
            data = TaskData.fromJson(json.data);
        } else if (json.data._type === 'EventData') {
            data = EventData.fromJson(json.data);
        } else {
            ASSERT(false, 'Unknown data type in TaskOrEvent.fromJson');
        }
        return new Entity(json.id, json.name, json.description, data);
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
    } else if (sometype === Entity) {
        try { new Entity(thing.id, thing.name, thing.description, thing.data); return true; } catch (e) { return false; }
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