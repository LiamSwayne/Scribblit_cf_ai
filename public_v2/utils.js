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

const NULL = Symbol('NULL'); // custom null because js null and undefined are off-limits
const Int = Symbol('Int'); // Symbol for integer type checking
const Type = Symbol('Type'); // Meta type to represent valid types
const NonEmptyString = Symbol('NonEmptyString'); // Symbol for non-empty string type checking

function symbolToJson(symbol) {
    ASSERT(typeof symbol === 'symbol', "symbolToJson expects a symbol.");
    ASSERT(exists(symbol.description) && symbol.description.length > 0, "Symbol for JSONification must have a description.");
    return '$(' + symbol.description + ')';
}

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
        
        ASSERT(type(endDate, Union(DateField, NULL)));
            
        // Convert to Date objects for comparison
        if (endDate !== NULL) {
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
        if (json.endDate === symbolToJson(NULL)) {
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
        
        ASSERT(type(dueTime, Union(TimeField, NULL)));
        
        ASSERT(type(completion, List(Int)));
        
        this.date = date;
        this.dueTime = dueTime;
        this.completion = completion;
    }

    toJson() {
        ASSERT(type(this, NonRecurringTaskInstance));
        let dueTimeJson;
        if (this.dueTime === NULL) {
            dueTimeJson = symbolToJson(NULL);
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
        if (json.dueTime === symbolToJson(NULL)) {
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
        ASSERT(type(dueTime, Union(TimeField, NULL)));
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
            dueTimeJson = symbolToJson(NULL);
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
        if (json.dueTime === symbolToJson(NULL)) {
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
        
        ASSERT(type(startTime, Union(TimeField, NULL)));
        ASSERT(type(endTime, Union(TimeField, NULL)));
        ASSERT(type(differentEndDate, Union(DateField, NULL)));

            // If both start and end times are provided, validate end is after start on same day
        if (startTime !== NULL && endTime !== NULL && differentEndDate === NULL) {
            const startMinutes = startTime.hour * 60 + startTime.minute;
            const endMinutes = endTime.hour * 60 + endTime.minute;
            ASSERT(endMinutes > startMinutes);
        }
        
        ASSERT(type(differentEndDate, Union(DateField, NULL)));
            
        // Convert to Date objects for comparison
        if (differentEndDate !== NULL) {
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
            startTimeJson = symbolToJson(NULL);
        } else {
            startTimeJson = this.startTime.toJson();
        }
        let endTimeJson;
        if (this.endTime === NULL) {
            endTimeJson = symbolToJson(NULL);
        } else {
            endTimeJson = this.endTime.toJson();
        }
        let differentEndDateJson;
        if (this.differentEndDate === NULL) {
            differentEndDateJson = symbolToJson(NULL);
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
        if (json.startTime === symbolToJson(NULL)) {
            startTime = NULL;
        } else {
            startTime = TimeField.fromJson(json.startTime);
        }

        let endTime;
        if (json.endTime === symbolToJson(NULL)) {
            endTime = NULL;
        } else {
            endTime = TimeField.fromJson(json.endTime);
        }

        let differentEndDate;
        if (json.differentEndDate === symbolToJson(NULL)) {
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
        ASSERT(type(startTime, Union(TimeField, NULL)));
        ASSERT(type(endTime, Union(TimeField, NULL)));
        ASSERT(type(range, Union(DateRange, RecurrenceCount)));
        ASSERT(type(differentEndDatePattern, Union(Int, NULL)));
            
            // If both start and end times are provided, validate end is after start on same day (if not multi-day)
        if (startTime !== NULL && endTime !== NULL && differentEndDatePattern === NULL) {
            const startMinutes = startTime.hour * 60 + startTime.minute;
            const endMinutes = endTime.hour * 60 + endTime.minute;
            ASSERT(endMinutes > startMinutes);
        }

        if (differentEndDatePattern !== NULL) {
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
            startTimeJson = symbolToJson(NULL);
        } else {
            startTimeJson = this.startTime.toJson();
        }
        let endTimeJson;
        if (this.endTime === NULL) {
            endTimeJson = symbolToJson(NULL);
        } else {
            endTimeJson = this.endTime.toJson();
        }
        let differentEndDatePatternJson;
        if (this.differentEndDatePattern === NULL) {
            differentEndDatePatternJson = symbolToJson(NULL);
        } else {
            differentEndDatePatternJson = this.differentEndDatePattern;
        }

        return {
            startDatePattern: this.startDatePattern.toJson(),
            startTime: startTimeJson,
            endTime: endTimeJson,
            range: this.range.toJson(),
            differentEndDatePattern: differentEndDatePatternJson,
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
        if (json.startTime === symbolToJson(NULL)) {
            startTime = NULL;
        } else {
            startTime = TimeField.fromJson(json.startTime);
        }

        let endTime;
        if (json.endTime === symbolToJson(NULL)) {
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
        let differentEndDatePattern;
        if (json.differentEndDatePattern === symbolToJson(NULL)) {
            differentEndDatePattern = NULL;
        } else {
            ASSERT(type(json.differentEndDatePattern, Int));
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
        
        ASSERT(type(workSessions, List(Union(NonRecurringEventInstance, RecurringEventInstance))));
        
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
        if (this.hideUntil === NULL) {
            hideUntilJson = symbolToJson(NULL);
        } else if (this.hideUntil === HideUntilDayOf) {
            hideUntilJson = symbolToJson(HideUntilDayOf);
        } else {
            hideUntilJson = this.hideUntil.toJson();
        }
        let workSessionsJson = [];
        for (const session of this.workSessions) {
            workSessionsJson.push(session.toJson());
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
        if (json.hideUntil === symbolToJson(NULL)) {
            hideUntil = NULL;
        } else if (json.hideUntil === symbolToJson(HideUntilDayOf)) {
            hideUntil = HideUntilDayOf;
        } else if (json.hideUntil._type === 'HideUntilRelative') {
            hideUntil = HideUntilRelative.fromJson(json.hideUntil);
        } else if (json.hideUntil._type === 'HideUntilDate') {
            hideUntil = HideUntilDate.fromJson(json.hideUntil);
        } else {
            ASSERT(false, 'Unknown hideUntil type in TaskData.fromJson');
        }
        let workSessions = [];
        ASSERT(Array.isArray(json.workSessions));
        for (const sessionJson of json.workSessions) {
            ASSERT(exists(sessionJson));
            if (sessionJson._type === 'NonRecurringEventInstance') {
                workSessions.push(NonRecurringEventInstance.fromJson(sessionJson));
            } else if (sessionJson._type === 'RecurringEventInstance') {
                workSessions.push(RecurringEventInstance.fromJson(sessionJson));
            } else {
                ASSERT(false, 'Unknown workSession type in TaskData.fromJson');
            }
        }
        return new TaskData(instances, hideUntil, json.showOverdue, workSessions);
    }
}

class EventData {
    constructor(instances) {
        // log("EventData constructor received instances:", instances);
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

// Reminder Instances
class NonRecurringReminderInstance {
    constructor(date, time) {
        ASSERT(type(date, DateField));
        ASSERT(type(time, Union(TimeField, NULL)));

        this.date = date;
        this.time = time;
    }

    toJson() {
        ASSERT(type(this, NonRecurringReminderInstance));
        let timeJson;
        if (this.time === NULL) {
            timeJson = symbolToJson(NULL);
        } else {
            timeJson = this.time.toJson();
        }
        return {
            date: this.date.toJson(),
            time: timeJson,
            _type: 'NonRecurringReminderInstance'
        };
    }

    static fromJson(json) {
        ASSERT(exists(json));
        let time;
        if (json.time === symbolToJson(NULL)) {
            time = NULL;
        } else {
            time = TimeField.fromJson(json.time);
        }
        return new NonRecurringReminderInstance(DateField.fromJson(json.date), time);
    }
}

class RecurringReminderInstance {
    constructor(datePattern, time, range) {
        ASSERT(type(datePattern, Union(EveryNDaysPattern, MonthlyPattern, AnnuallyPattern)));

        ASSERT(type(time, Union(TimeField, NULL)));

        ASSERT(type(range, Union(DateRange, RecurrenceCount)));

        this.datePattern = datePattern;
        this.time = time;
        this.range = range;
    }

    toJson() {
        ASSERT(type(this, RecurringReminderInstance));
        let timeJson;
        if (this.time === NULL) {
            timeJson = symbolToJson(NULL);
        } else {
            timeJson = this.time.toJson();
        }
        return {
            datePattern: this.datePattern.toJson(),
            time: timeJson,
            range: this.range.toJson(),
            _type: 'RecurringReminderInstance'
        };
    }

    static fromJson(json) {
        ASSERT(exists(json) && exists(json.datePattern));
        let datePattern;
        if (json.datePattern._type === 'EveryNDaysPattern') {
            datePattern = EveryNDaysPattern.fromJson(json.datePattern);
        } else if (json.datePattern._type === 'MonthlyPattern') {
            datePattern = MonthlyPattern.fromJson(json.datePattern);
        } else if (json.datePattern._type === 'AnnuallyPattern') {
            datePattern = AnnuallyPattern.fromJson(json.datePattern);
        } else {
            ASSERT(false, 'Unknown datePattern type in RecurringReminderInstance.fromJson');
        }

        let time;
        if (json.time === symbolToJson(NULL)) {
            time = NULL;
        } else {
            time = TimeField.fromJson(json.time);
        }

        let range;
        if (json.range._type === 'DateRange') {
            range = DateRange.fromJson(json.range);
        } else if (json.range._type === 'RecurrenceCount') {
            range = RecurrenceCount.fromJson(json.range);
        } else {
            ASSERT(false, 'Unknown range type in RecurringReminderInstance.fromJson');
        }

        return new RecurringReminderInstance(datePattern, time, range);
    }
}

class ReminderData {
    constructor(instances) {
        ASSERT(type(instances, List(Union(NonRecurringReminderInstance, RecurringReminderInstance))));
        this.instances = instances;
    }

    toJson() {
        ASSERT(type(this, ReminderData));
        let instancesJson = [];
        for (const instance of this.instances) {
            instancesJson.push(instance.toJson());
        }
        return {
            instances: instancesJson,
            _type: 'ReminderData'
        };
    }

    static fromJson(json) {
        ASSERT(exists(json));
        let instances = [];
        for (const instanceJson of json.instances) {
            if (instanceJson._type === 'NonRecurringReminderInstance') {
                instances.push(NonRecurringReminderInstance.fromJson(instanceJson));
            } else if (instanceJson._type === 'RecurringReminderInstance') {
                instances.push(RecurringReminderInstance.fromJson(instanceJson));
            } else {
                ASSERT(false, 'Unknown instance type in ReminderData.fromJson');
            }
        }
        return new ReminderData(instances);
    }
}

// The uppermost level of the data structure
// Contains a task, event, or reminder
class Entity {
    constructor(id, name, description, data) {
        ASSERT(type(id, NonEmptyString));
        ASSERT(type(name, NonEmptyString));
        ASSERT(type(description, String));
        ASSERT(type(data, Union(TaskData, EventData, ReminderData)));
        
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
        ASSERT(exists(json) && exists(json.data));
        let data;
        if (json.data._type === 'TaskData') {
            data = TaskData.fromJson(json.data);
        } else if (json.data._type === 'EventData') {
            data = EventData.fromJson(json.data);
        } else if (json.data._type === 'ReminderData') {
            data = ReminderData.fromJson(json.data);
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
        // Separate types into symbols and others
        const symbolTypes = [];
        const otherTypes = [];
        for (const t of sometype.types) {
            ASSERT(type(t, Type));
            // Custom symbols (NULL, Int, etc.) are typeof 'symbol'
            if (typeof t === 'symbol') {
                symbolTypes.push(t);
            } else {
                otherTypes.push(t);
            }
        }

        // Check symbol types first
        for (const unionType of symbolTypes) {
            if (type(thing, unionType)) return true;
        }

        // Then check other types (classes, primitive constructors, other LIST/DICT/UNION)
        for (const unionType of otherTypes) {
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
        if (!(thing instanceof DateField)) return false;
        try { new DateField(thing.year, thing.month, thing.day); return true; } catch (e) { return false; }
    } else if (sometype === TimeField) {
        if (!(thing instanceof TimeField)) return false;
        try { new TimeField(thing.hour, thing.minute); return true; } catch (e) { return false; }
    } else if (sometype === EveryNDaysPattern) {
        if (!(thing instanceof EveryNDaysPattern)) return false;
        try { new EveryNDaysPattern(thing.initialDate, thing.n); return true; } catch (e) { return false; }
    } else if (sometype === MonthlyPattern) {
        if (!(thing instanceof MonthlyPattern)) return false;
        try { new MonthlyPattern(thing.day); return true; } catch (e) { return false; }
    } else if (sometype === AnnuallyPattern) {
        if (!(thing instanceof AnnuallyPattern)) return false;
        try { new AnnuallyPattern(thing.month, thing.day); return true; } catch (e) { return false; }
    } else if (sometype === DateRange) {
        if (!(thing instanceof DateRange)) return false;
        try { new DateRange(thing.startDate, thing.endDate); return true; } catch (e) { return false; }
    } else if (sometype === RecurrenceCount) {
        if (!(thing instanceof RecurrenceCount)) return false;
        try { new RecurrenceCount(thing.count); return true; } catch (e) { return false; }
    } else if (sometype === NonRecurringTaskInstance) {
        if (!(thing instanceof NonRecurringTaskInstance)) return false;
        try { new NonRecurringTaskInstance(thing.date, thing.dueTime, thing.completion); return true; } catch (e) { return false; }
    } else if (sometype === RecurringTaskInstance) {
        if (!(thing instanceof RecurringTaskInstance)) return false;
        try { new RecurringTaskInstance(thing.datePattern, thing.dueTime, thing.range, thing.completion); return true; } catch (e) { return false; }
    } else if (sometype === NonRecurringEventInstance) {
        if (!(thing instanceof NonRecurringEventInstance)) return false;
        try { new NonRecurringEventInstance(thing.startDate, thing.startTime, thing.endTime, thing.differentEndDate); return true; } catch (e) { return false; }
    } else if (sometype === RecurringEventInstance) {
        if (!(thing instanceof RecurringEventInstance)) return false;
        try { new RecurringEventInstance(thing.startDatePattern, thing.startTime, thing.endTime, thing.range, thing.differentEndDatePattern); return true; } catch (e) { return false; }
    } else if (sometype === NonRecurringReminderInstance) {
        if (!(thing instanceof NonRecurringReminderInstance)) return false;
        try { new NonRecurringReminderInstance(thing.date, thing.time); return true; } catch (e) { return false; }
    } else if (sometype === RecurringReminderInstance) {
        if (!(thing instanceof RecurringReminderInstance)) return false;
        try { new RecurringReminderInstance(thing.datePattern, thing.time, thing.range); return true; } catch (e) { return false; }
    } else if (sometype === TaskData) {
        if (!(thing instanceof TaskData)) return false;
        try { new TaskData(thing.instances, thing.hideUntil, thing.showOverdue, thing.workSessions); return true; } catch (e) { return false; }
    } else if (sometype === EventData) {
        if (!(thing instanceof EventData)) return false;
        try { new EventData(thing.instances); return true; } catch (e) { return false; }
    } else if (sometype === ReminderData) {
        if (!(thing instanceof ReminderData)) return false;
        try { new ReminderData(thing.instances); return true; } catch (e) { return false; }
    } else if (sometype === Entity) {
        if (!(thing instanceof Entity)) return false;
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