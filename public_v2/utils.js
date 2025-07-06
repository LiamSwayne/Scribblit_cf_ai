let TESTING = false;
let TESTING_USER_IS_EMPTY = false;
let TESTING_SHOW_LOGS = true;

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

let palettes = {
    'dark': { // default
        accent: ['#4a83ff', '#c64aff'],
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

function wait(ms, func) {
    ASSERT(type(ms, Int), "wait: ms must be an integer");
    ASSERT(type(func, Function), "wait: func must be a function");
    setTimeout(func, ms);
}

const defaultCutoffUnix = 1947483647; // about the year 2031

function AiReturnedNullField(field) {
    return field === null || field === undefined || field === '' || field === 'null' || field === 'NULL' || field === 'undefined';
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
        ASSERT(Array.isArray(types), "UNION constructor requires an array of types");
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
    if (TESTING_SHOW_LOGS) {
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

    toUnixTimestamp() {
        ASSERT(type(this, DateField));
        return (new Date(this.year, this.month - 1, this.day)).getTime();
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

    static fromAiJson(json) {
        ASSERT(exists(json));
        ASSERT(json.type === 'every_n_days_pattern', "EveryNDaysPattern.fromAiJson: json.type must be 'every_n_days_pattern'");
        ASSERT(!AiReturnedNullField(json.initial_date), "EveryNDaysPattern.fromAiJson: initial_date is required");
        ASSERT(!AiReturnedNullField(json.n), "EveryNDaysPattern.fromAiJson: n is required");
        const initialDate = DateField.fromYYYY_MM_DD(json.initial_date);
        const n = Number(json.n);
        ASSERT(type(n, Int) && n > 0, "EveryNDaysPattern.fromAiJson: n must be a positive integer");
        return new EveryNDaysPattern(initialDate, n);
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
    constructor(day, months) {
        ASSERT(type(day, Int));
        ASSERT((day >= 1 && day <= 31) || day === -1); // -1 means last day of the month
        ASSERT(type(months, List(Boolean)) && months.length === 12, "MonthlyPattern: months must be an array of 12 booleans.");

        // check that at least one month is true
        ASSERT(months.some(month => month), "MonthlyPattern: at least one month must be true.");
        
        this.day = day;
        this.months = months;
    }

    toJson() {
        ASSERT(type(this, MonthlyPattern));
        return {
            day: this.day,
            months: this.months,
            _type: 'MonthlyPattern'
        };
    }

    static fromJson(json) {
        ASSERT(exists(json));
        ASSERT(exists(json.months), "MonthlyPattern.fromJson: months property is missing.");
        return new MonthlyPattern(json.day, json.months);
    }

    static fromAiJson(json) {
        ASSERT(exists(json));
        ASSERT(json.type === 'monthly_pattern', "MonthlyPattern.fromAiJson: json.type must be 'monthly_pattern'");
        ASSERT(!AiReturnedNullField(json.day), "MonthlyPattern.fromAiJson: day is required");
        let day = Number(json.day);
        ASSERT(type(day, Int));

        ASSERT(!AiReturnedNullField(json.months), "MonthlyPattern.fromAiJson: months array is required");
        const monthsRaw = json.months;
        ASSERT(Array.isArray(monthsRaw) && monthsRaw.length === 12, "MonthlyPattern.fromAiJson: months must be an array of 12 booleans");
        const months = monthsRaw.map(m => !!m);

        return new MonthlyPattern(day, months);
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

    static fromAiJson(json) {
        ASSERT(exists(json));
        ASSERT(json.type === 'annually_pattern', "AnnuallyPattern.fromAiJson: json.type must be 'annually_pattern'");
        ASSERT(!AiReturnedNullField(json.month), "AnnuallyPattern.fromAiJson: month is required");
        ASSERT(!AiReturnedNullField(json.day), "AnnuallyPattern.fromAiJson: day is required");
        const month = Number(json.month);
        const day = Number(json.day);
        ASSERT(type(month, Int) && type(day, Int));
        return new AnnuallyPattern(month, day);
    }
}

const LAST_WEEK_OF_MONTH = Symbol('last_week_of_month');

// Nth Weekday of Months Pattern
class NthWeekdayOfMonthsPattern {
    constructor(dayOfWeek, nthWeekdays, months) {
        ASSERT(type(dayOfWeek, DAY_OF_WEEK), "NthWeekdayOfMonthsPattern: dayOfWeek must be a DAY_OF_WEEK value (e.g. 'monday').");
        
        ASSERT(type(nthWeekdays, LAST_WEEK_OF_MONTH) || (type(nthWeekdays, List(Boolean)) && nthWeekdays.length === 4 && nthWeekdays.some(week => week)), "NthWeekdayOfMonthsPattern: nthWeekdays must be an array of 4 booleans and at least one value must be true. Or it must be the symbol LAST_WEEK_OF_MONTH.");

        ASSERT(type(months, List(Boolean)) && months.length === 12, "NthWeekdayOfMonthsPattern: months must be an array of 12 booleans.");
        ASSERT(months.some(month => month), "NthWeekdayOfMonthsPattern: at least one month must be true.");

        this.dayOfWeek = dayOfWeek;
        this.nthWeekdays = nthWeekdays;
        this.months = months;
    }

    toJson() {
        ASSERT(type(this, NthWeekdayOfMonthsPattern));
        return {
            dayOfWeek: this.dayOfWeek,
            nthWeekdays: this.nthWeekdays,
            months: this.months,
            _type: 'NthWeekdayOfMonthsPattern'
        };
    }

    static fromJson(json) {
        ASSERT(exists(json));
        ASSERT(exists(json.nthWeekdays), "NthWeekdayOfMonthsPattern.fromJson: nthWeekdays property is missing.");
        ASSERT(exists(json.months), "NthWeekdayOfMonthsPattern.fromJson: months property is missing.");
        return new NthWeekdayOfMonthsPattern(json.dayOfWeek, json.nthWeekdays, json.months);
    }

    static fromAiJson(json) {
        if(!exists(json)) {
            return NULL;
        }
        
        if(json.type !== 'nth_weekday_of_months_pattern') {
            return NULL;
        }

        // day_of_week: integer 1-7 -> string
        if(AiReturnedNullField(json.day_of_week)) {
            log("NthWeekdayOfMonthsPattern.fromAiJson: day_of_week is null");
            return NULL;
        }
        const dowNum = Number(json.day_of_week);
        if(!(type(dowNum, Int) && dowNum >= 1 && dowNum <= 7)) {
            log("NthWeekdayOfMonthsPattern.fromAiJson: day_of_week is not a valid integer 1-7");
            return NULL;
        }
        const dowMap = {1:'monday',2:'tuesday',3:'wednesday',4:'thursday',5:'friday',6:'saturday',7:'sunday'};
        const dayOfWeek = dowMap[dowNum];

        // weeks_of_month: "last" or array of 4 booleans
        let weeksSpec = json.weeks_of_month;
        if (type(weeksSpec, String)) {
            if(weeksSpec === 'last') {
                weeksSpec = LAST_WEEK_OF_MONTH;
            } else {
                log("NthWeekdayOfMonthsPattern.fromAiJson: weeks_of_month must be 'last'");
                return NULL;
            }
        } else if (type(weeksSpec, List(Boolean))) {
            if(weeksSpec.length !== 4) {
                log("NthWeekdayOfMonthsPattern.fromAiJson: weeks_of_month must be 'last' or array of 4 booleans");
                return NULL;
            }
            if(!weeksSpec.some(week => week)) {
                log("NthWeekdayOfMonthsPattern.fromAiJson: at least one week must be true");
                return NULL;
            }
        } else {
            log("NthWeekdayOfMonthsPattern.fromAiJson: weeks_of_month is not a valid type");
            return NULL;
        }

        // months: array of 12 booleans required
        if(AiReturnedNullField(json.months)) {
            log("NthWeekdayOfMonthsPattern.fromAiJson: months array is null");
            return NULL;
        }
        const monthsRaw = json.months;
        if(!(type(monthsRaw, List(Boolean)) && monthsRaw.length === 12)) {
            log("NthWeekdayOfMonthsPattern.fromAiJson: months must be an array of 12 booleans");
            return NULL;
        }
        const months = monthsRaw.map(m => Boolean(m));

        return new NthWeekdayOfMonthsPattern(dayOfWeek, weeksSpec, months);
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
    constructor(initialDate, count) {
        ASSERT(type(initialDate, DateField));
        ASSERT(type(count, Int));
        ASSERT(count > 0);
        
        this.initialDate = initialDate;
        this.count = count;
    }

    toJson() {
        ASSERT(type(this, RecurrenceCount));
        return {
            initialDate: this.initialDate.toJson(),
            count: this.count,
            _type: 'RecurrenceCount'
        };
    }

    static fromJson(json) {
        ASSERT(exists(json));
        return new RecurrenceCount(DateField.fromJson(json.initialDate), json.count);
    }
}

// Task instances
class NonRecurringTaskInstance {
    constructor(date, dueTime, completion) {
        ASSERT(type(date, DateField));
        
        ASSERT(type(dueTime, Union(TimeField, NULL)));
        
        ASSERT(type(completion, Boolean));
        
        this.date = date;
        this.dueTime = dueTime;
        this.completion = completion;
    }

    getDueDate() {
        ASSERT(type(this, NonRecurringTaskInstance));
        return this.date.toUnixTimestamp();
    }

    // no unix args since it only happens once
    isComplete(startUnix, endUnix) {
        ASSERT(type(this, NonRecurringTaskInstance));
        ASSERT(type(startUnix, Union(Int, NULL)));
        ASSERT(type(endUnix, Union(Int, NULL)));

        if (startUnix !== NULL && endUnix !== NULL) {
            const dueDate = this.date.toUnixTimestamp();
            if (dueDate < startUnix || dueDate > endUnix) {
                // outside the range, so it's complete in that range
                return true;
            }
        }

        return this.completion;
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

    // Parse AI-supplied JSON describing a one-off due-date instance.
    // Expected format:
    //  { "type": "due_date_instance", "date": "YYYY-MM-DD" | null, "time": "HH:MM" | null }
    static fromAiJson(json) {
        ASSERT(exists(json));
        ASSERT(json.type === 'due_date_instance', 'NonRecurringTaskInstance.fromAiJson: json.type must be "due_date_instance"');

        // DATE
        let dateField = NULL;
        if (!AiReturnedNullField(json.date)) {
            ASSERT(type(json.date, NonEmptyString), 'NonRecurringTaskInstance.fromAiJson: date must be string YYYY-MM-DD');
            dateField = DateField.fromYYYY_MM_DD(json.date);
        }

        // TIME
        let dueTime = NULL;
        if (!AiReturnedNullField(json.time)) {
            const t = json.time;
            ASSERT(type(t, NonEmptyString), 'NonRecurringTaskInstance.fromAiJson: time must be HH:MM string');
            const parts = t.split(':');
            ASSERT(parts.length === 2, 'NonRecurringTaskInstance.fromAiJson: time must be HH:MM');
            const hour = Number(parts[0]);
            const minute = Number(parts[1]);
            ASSERT(type(hour, Int) && type(minute, Int));
            dueTime = new TimeField(hour, minute);
        }

        // If date missing but time provided -> assume today (UTC)
        if (dateField === NULL && dueTime !== NULL) {
            const now = new Date();
            dateField = new DateField(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate());
        }

        ASSERT(dateField !== NULL, 'NonRecurringTaskInstance.fromAiJson: must have either date or time (with implicit today)');

        return new NonRecurringTaskInstance(dateField, dueTime === NULL ? NULL : dueTime, false);
    }
}

class RecurringTaskInstance {
    constructor(datePattern, dueTime, range, completion) {
        ASSERT(type(datePattern, Union(EveryNDaysPattern, MonthlyPattern, AnnuallyPattern, NthWeekdayOfMonthsPattern)), "1");
        ASSERT(type(dueTime, Union(TimeField, NULL)), "2");
        ASSERT(type(range, Union(DateRange, RecurrenceCount)), "3");
        ASSERT(type(completion, List(Int)), "4");

        this.datePattern = datePattern;
        this.dueTime = dueTime;
        this.range = range;
        this.completion = completion;
    }

    getDueDatesInRange(startUnix, endUnix) {
        ASSERT(type(this, RecurringTaskInstance));
        ASSERT(type(startUnix, Union(Int, NULL)));
        ASSERT(type(endUnix, Union(Int, NULL)));

        let lowerBound;
        let upperBound;

        if (type(this.range, DateRange)) {
            lowerBound = this.range.startDate.toUnixTimestamp();
            upperBound = this.range.endDate === NULL ? defaultCutoffUnix : this.range.endDate.toUnixTimestamp();
        } else { // RecurrenceCount
            lowerBound = this.range.initialDate.toUnixTimestamp();
            upperBound = defaultCutoffUnix;
        }

        if (startUnix !== NULL) {
            lowerBound = Math.max(startUnix, lowerBound);
        }
        if (endUnix !== NULL) {
            upperBound = Math.min(endUnix, upperBound);
        }
        
        let dueDates = [];
        if (type(this.datePattern, EveryNDaysPattern)) {
            // we first need to align the lower bound to the first instance of the pattern
            let current = this.datePattern.initialDate.toUnixTimestamp();
            while (current < lowerBound) {
                current += this.datePattern.n * 24 * 60 * 60 * 1000;
            }

            while (current <= upperBound) {
                dueDates.push(current);
                current += this.datePattern.n * 24 * 60 * 60 * 1000;
                if (type(this.range, RecurrenceCount) && dueDates.length >= this.range.count) {
                    break;
                }
            }
        } else if (type(this.datePattern, MonthlyPattern)) {
            let startDate = new Date(lowerBound);
            let startYear = startDate.getUTCFullYear();
            let startMonth = startDate.getUTCMonth(); // 0-indexed

            let endDate = new Date(upperBound);
            let endYear = endDate.getUTCFullYear();
            let endMonth = endDate.getUTCMonth();

            for (let year = startYear; year <= endYear; year++) {
                // if the start year is the same as the end year, we can just use the start and end months
                // otherwise, we need to iterate through all months
                let monthStart = (year === startYear) ? startMonth : 0;
                let monthEnd = (year === endYear) ? endMonth : 11;

                for (let month = monthStart; month <= monthEnd; month++) {
                    if (this.datePattern.months[month]) {
                        // Use UTC to prevent timezone shifts
                        let dueDate = new Date(Date.UTC(year, month, this.datePattern.day));
                        
                        // Check if the day is valid for that month
                        if (dueDate.getUTCMonth() !== month) {
                            continue; // e.g. day 31 in a 30-day month
                        }

                        let dueDateTime = dueDate.getTime();

                        if (dueDateTime >= lowerBound && dueDateTime <= upperBound) {
                            dueDates.push(dueDateTime);
                            if (type(this.range, RecurrenceCount) && dueDates.length >= this.range.count) {
                                break;
                            }
                        }
                    }
                }
                if (type(this.range, RecurrenceCount) && dueDates.length >= this.range.count) {
                    break;
                }
            }
        } else if (type(this.datePattern, AnnuallyPattern)) {
            let startDate = new Date(lowerBound);
            // Adjust to UTC to avoid timezone issues with year calculation
            let startYear = startDate.getUTCFullYear();
            
            let endDate = new Date(upperBound);
            let endYear = endDate.getUTCFullYear();

            for (let year = startYear; year <= endYear; year++) {
                // month is 1-based in AnnuallyPattern, day is 1-based.
                // Date constructor month is 0-based.
                // Use UTC to prevent timezone shifts from affecting the date.
                let dueDate = new Date(Date.UTC(year, this.datePattern.month - 1, this.datePattern.day));
                let dueDateTime = dueDate.getTime();

                if (dueDateTime >= lowerBound && dueDateTime <= upperBound) {
                    dueDates.push(dueDateTime);
                }
                if (type(this.range, RecurrenceCount) && dueDates.length >= this.range.count) {
                    break;
                }
            }
        } else if (type(this.datePattern, NthWeekdayOfMonthsPattern)) {
            const dayOfWeekMap = { 'sunday': 0, 'monday': 1, 'tuesday': 2, 'wednesday': 3, 'thursday': 4, 'friday': 5, 'saturday': 6 };
            const targetDayOfWeek = dayOfWeekMap[this.datePattern.dayOfWeek];

            let startDate = new Date(lowerBound);
            let startYear = startDate.getUTCFullYear();
            let startMonth = startDate.getUTCMonth();

            let endDate = new Date(upperBound);
            let endYear = endDate.getUTCFullYear();
            let endMonth = endDate.getUTCMonth();
            
            let potentialDueDates = [];

            for (let year = startYear; year <= endYear; year++) {
                let monthStart = (year === startYear) ? startMonth : 0;
                let monthEnd = (year === endYear) ? endMonth : 11;

                for (let month = monthStart; month <= monthEnd; month++) {
                    if (this.datePattern.months[month]) {
                        let weekdaysInMonth = [];
                        let daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
                        for (let day = 1; day <= daysInMonth; day++) {
                            let currentDate = new Date(Date.UTC(year, month, day));
                            if (currentDate.getUTCDay() === targetDayOfWeek) {
                                weekdaysInMonth.push(currentDate);
                            }
                        }

                        for (const nStr in this.datePattern.nthWeekdays) {
                            if (this.datePattern.nthWeekdays[nStr]) {
                                const n = Number(nStr);
                                let selectedDate = NULL;
                                if (n > 0 && n <= weekdaysInMonth.length) {
                                    selectedDate = weekdaysInMonth[n - 1];
                                } else if (n === -1 && weekdaysInMonth.length > 0) {
                                    selectedDate = weekdaysInMonth[weekdaysInMonth.length - 1];
                                }

                                if (selectedDate !== NULL) {
                                    let dueDateTime = selectedDate.getTime();
                                    if (dueDateTime >= lowerBound && dueDateTime <= upperBound) {
                                        potentialDueDates.push(dueDateTime);
                                    }
                                }
                            }
                        }
                    }
                }
            }
            
            potentialDueDates.sort((a, b) => a - b);

            if (type(this.range, RecurrenceCount)) {
                dueDates = potentialDueDates.slice(0, this.range.count);
            } else {
                dueDates = potentialDueDates;
            }
        }

        return dueDates;
    }

    isComplete(startUnix, endUnix) {
        ASSERT(type(this, RecurringTaskInstance));
        ASSERT(type(startUnix, Union(Int, NULL)));
        ASSERT(type(endUnix, Union(Int, NULL)));

        let dueDates = this.getDueDatesInRange(startUnix, endUnix);

        for (const date of dueDates) {
            if (!this.completion.includes(date)) {
                return false;
            }
        }
        return true;
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
        } else if (json.datePattern._type === 'NthWeekdayOfMonthsPattern') {
            datePattern = NthWeekdayOfMonthsPattern.fromJson(json.datePattern);
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

    // Parse AI-supplied JSON describing a recurring due-date pattern instance.
    // Expected format:
    //  { "type": "due_date_pattern", "pattern": {...}, "time": "HH:MM" | null, "range": "YYYY-MM-DD:YYYY-MM-DD" | integer }
    static fromAiJson(json) {
        ASSERT(exists(json));
        ASSERT(json.type === 'due_date_pattern', 'RecurringTaskInstance.fromAiJson: json.type must be "due_date_pattern"');

        // --- PATTERN ---
        ASSERT(exists(json.pattern), 'RecurringTaskInstance.fromAiJson: pattern is required');
        const pt = json.pattern;
        ASSERT(type(pt.type, NonEmptyString), 'RecurringTaskInstance.fromAiJson: pattern.type missing');
        let datePattern;
        if (pt.type === 'every_n_days_pattern') {
            datePattern = EveryNDaysPattern.fromAiJson(pt);
        } else if (pt.type === 'monthly_pattern') {
            datePattern = MonthlyPattern.fromAiJson(pt);
        } else if (pt.type === 'annually_pattern') {
            datePattern = AnnuallyPattern.fromAiJson(pt);
        } else if (pt.type === 'nth_weekday_of_months_pattern') {
            datePattern = NthWeekdayOfMonthsPattern.fromAiJson(pt);
        } else {
            ASSERT(false, 'RecurringTaskInstance.fromAiJson: unknown pattern.type ' + String(pt.type));
        }

        // --- TIME ---
        let dueTime = NULL;
        if (!AiReturnedNullField(json.time)) {
            const t = json.time;
            ASSERT(type(t, NonEmptyString), 'RecurringTaskInstance.fromAiJson: time must be HH:MM string');
            const parts = t.split(':');
            ASSERT(parts.length === 2, 'RecurringTaskInstance.fromAiJson: time must be HH:MM');
            const hour = Number(parts[0]);
            const minute = Number(parts[1]);
            ASSERT(type(hour, Int) && type(minute, Int));
            dueTime = new TimeField(hour, minute);
        }

        // --- RANGE ---
        ASSERT(!AiReturnedNullField(json.range), 'RecurringTaskInstance.fromAiJson: range is required');
        let rangeSpec = json.range;
        let range;
        if (typeof rangeSpec === 'string') {
            const parts = rangeSpec.split(':');
            ASSERT(parts.length === 2, 'RecurringTaskInstance.fromAiJson: range string must be "start:end"');
            const startDate = DateField.fromYYYY_MM_DD(parts[0]);
            let endDate;
            if (AiReturnedNullField(parts[1]) || parts[1] === '') {
                endDate = NULL;
            } else {
                endDate = DateField.fromYYYY_MM_DD(parts[1]);
            }
            range = new DateRange(startDate, endDate);
        } else {
            // Expect integer recurrence count
            const count = Number(rangeSpec);
            ASSERT(type(count, Int) && count > 0, 'RecurringTaskInstance.fromAiJson: range integer must be positive');
            // Only valid if pattern provides initialDate
            ASSERT(type(datePattern, EveryNDaysPattern), 'RecurringTaskInstance.fromAiJson: numeric range only allowed with every_n_days_pattern');
            range = new RecurrenceCount(datePattern.initialDate, count);
        }

        return new RecurringTaskInstance(datePattern, dueTime, range, []);
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

        // If endTime is NULL, differentEndDate must also be NULL
        if (endTime === NULL) {
            ASSERT(differentEndDate === NULL, "If endTime is NULL, differentEndDate must also be NULL for NonRecurringEventInstance. Arguments:" + JSON.stringify({startDate, startTime, endTime, differentEndDate}));
        }
        
        ASSERT(type(differentEndDate, Union(DateField, NULL)));
            
        // Convert to Date objects for comparison
        if (differentEndDate !== NULL) {
            const startDateObj = new Date(startDate.year, startDate.month - 1, startDate.day);
            const endDateObj = new Date(differentEndDate.year, differentEndDate.month - 1, differentEndDate.day);
            ASSERT(endDateObj > startDateObj);
        }

        // if start time is not given, end time cannot be given
        if (startTime === NULL) {
            ASSERT(endTime === NULL, "If start time is not given, end time must be NULL for NonRecurringEventInstance.");
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

    // Parse AI-supplied JSON for a singular event occurrence.
    // Expected format:
    //  {
    //    "type": "event_instance",
    //    "start_date": "YYYY-MM-DD",
    //    "start_time": "HH:MM",          // optional
    //    "end_time": "HH:MM" | null,      // optional
    //    "different_end_date": "YYYY-MM-DD" | null // optional
    //  }
    static fromAiJson(json) {
        ASSERT(exists(json));
        ASSERT(json.type === 'event_instance', 'NonRecurringEventInstance.fromAiJson: json.type must be "event_instance"');

        // start_date (required)
        ASSERT(!AiReturnedNullField(json.start_date), 'NonRecurringEventInstance.fromAiJson: start_date is required');
        const startDate = DateField.fromYYYY_MM_DD(json.start_date);

        // start_time (optional)
        let startTime = NULL;
        if (!AiReturnedNullField(json.start_time)) {
            const stParts = json.start_time.split(':');
            ASSERT(stParts.length === 2, 'NonRecurringEventInstance.fromAiJson: start_time must be HH:MM');
            startTime = new TimeField(Number(stParts[0]), Number(stParts[1]));
        }

        // end_time (optional)
        let endTime = NULL;
        if (!AiReturnedNullField(json.end_time)) {
            const etParts = json.end_time.split(':');
            ASSERT(etParts.length === 2, 'NonRecurringEventInstance.fromAiJson: end_time must be HH:MM');
            endTime = new TimeField(Number(etParts[0]), Number(etParts[1]));
        }

        // different_end_date (optional)
        let differentEndDate = NULL;
        if (!AiReturnedNullField(json.different_end_date)) {
            differentEndDate = DateField.fromYYYY_MM_DD(json.different_end_date);
        }

        // Validation: if startTime is NULL, endTime must also be NULL. If endTime is NULL, differentEndDate must be NULL.
        if (startTime === NULL) {
            ASSERT(endTime === NULL, 'NonRecurringEventInstance.fromAiJson: end_time must be NULL if start_time is NULL');
        }
        if (endTime === NULL) {
            ASSERT(differentEndDate === NULL, 'NonRecurringEventInstance.fromAiJson: different_end_date must be NULL if end_time is NULL');
        }

        return new NonRecurringEventInstance(startDate, startTime, endTime, differentEndDate);
    }
}

class RecurringEventInstance {
    constructor(startDatePattern, startTime, endTime, range, differentEndDatePattern) {
        ASSERT(type(startDatePattern, Union(EveryNDaysPattern, MonthlyPattern, AnnuallyPattern, NthWeekdayOfMonthsPattern)));
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

        // If endTime is NULL, differentEndDatePattern must also be NULL
        if (endTime === NULL) {
            ASSERT(differentEndDatePattern === NULL, "If endTime is NULL, differentEndDatePattern must also be NULL for RecurringEventInstance.");
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
        } else if (json.startDatePattern._type === 'NthWeekdayOfMonthsPattern') {
            startDatePattern = NthWeekdayOfMonthsPattern.fromJson(json.startDatePattern);
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

    // Parse AI-supplied JSON for a recurring event pattern.
    // Expected format:
    // {
    //   "type": "event_pattern",
    //   "start_date_pattern": { ... },
    //   "start_time": "HH:MM" | null,
    //   "end_time": "HH:MM" | null,
    //   "different_end_date_offset": int | null,
    //   "range": "YYYY-MM-DD:YYYY-MM-DD" | int
    // }
    static fromAiJson(json) {
        ASSERT(exists(json));
        ASSERT(json.type === 'event_pattern', 'RecurringEventInstance.fromAiJson: json.type must be "event_pattern"');

        // --- PATTERN ---
        ASSERT(exists(json.start_date_pattern), 'RecurringEventInstance.fromAiJson: start_date_pattern required');
        const p = json.start_date_pattern;
        let startDatePattern;
        if (p.type === 'every_n_days_pattern') {
            startDatePattern = EveryNDaysPattern.fromAiJson(p);
        } else if (p.type === 'monthly_pattern') {
            startDatePattern = MonthlyPattern.fromAiJson(p);
        } else if (p.type === 'annually_pattern') {
            startDatePattern = AnnuallyPattern.fromAiJson(p);
        } else if (p.type === 'nth_weekday_of_months_pattern') {
            startDatePattern = NthWeekdayOfMonthsPattern.fromAiJson(p);
        } else {
            ASSERT(false, 'RecurringEventInstance.fromAiJson: unknown start_date_pattern.type ' + String(p.type));
        }

        // --- TIMES ---
        let startTime = NULL;
        if (!AiReturnedNullField(json.start_time)) {
            const parts = json.start_time.split(':');
            ASSERT(parts.length === 2, 'RecurringEventInstance.fromAiJson: start_time must be HH:MM');
            startTime = new TimeField(Number(parts[0]), Number(parts[1]));
        }

        let endTime = NULL;
        if (!AiReturnedNullField(json.end_time)) {
            const parts = json.end_time.split(':');
            ASSERT(parts.length === 2, 'RecurringEventInstance.fromAiJson: end_time must be HH:MM');
            endTime = new TimeField(Number(parts[0]), Number(parts[1]));
        }

        // --- different_end_date_offset ---
        let differentEndDatePattern = NULL;
        if (!AiReturnedNullField(json.different_end_date_offset)) {
            const off = Number(json.different_end_date_offset);
            ASSERT(type(off, Int) && off > 0, 'RecurringEventInstance.fromAiJson: different_end_date_offset must be positive int');
            differentEndDatePattern = off;
        }

        // Validation: if startTime is NULL, endTime must also be NULL. If endTime is NULL, differentEndDatePattern must be NULL.
        if (startTime === NULL) {
            ASSERT(endTime === NULL, 'RecurringEventInstance.fromAiJson: end_time must be NULL if start_time is NULL');
        }
        if (endTime === NULL) {
            ASSERT(differentEndDatePattern === NULL, 'RecurringEventInstance.fromAiJson: different_end_date_offset must be NULL if end_time is NULL');
        }

        // --- RANGE ---
        ASSERT(!AiReturnedNullField(json.range), 'RecurringEventInstance.fromAiJson: range is required');
        let range;
        if (typeof json.range === 'string') {
            const parts = json.range.split(':');
            ASSERT(parts.length === 2, 'RecurringEventInstance.fromAiJson: range string must be "start:end"');
            const startDate = DateField.fromYYYY_MM_DD(parts[0]);
            let endDate;
            if (AiReturnedNullField(parts[1]) || parts[1] === '') {
                endDate = NULL;
            } else {
                endDate = DateField.fromYYYY_MM_DD(parts[1]);
            }
            range = new DateRange(startDate, endDate);
        } else {
            const count = Number(json.range);
            ASSERT(type(count, Int) && count > 0, 'RecurringEventInstance.fromAiJson: numeric range must be positive integer');
            // Only allow numeric recurrence for patterns that contain an initial date
            ASSERT(p.type === 'every_n_days_pattern', 'RecurringEventInstance.fromAiJson: numeric range only allowed with every_n_days_pattern');
            range = new RecurrenceCount(startDatePattern.initialDate, count);
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

        // TODO make sure that every work session ends before the due date of the task
        
        this.instances = instances;
        this.hideUntil = hideUntil;
        this.showOverdue = showOverdue;
        this.workSessions = workSessions;
    }

    getDueDates(startUnix, endUnix) {
        ASSERT(type(this, TaskData));
        ASSERT(type(startUnix, Union(Int, NULL)));
        ASSERT(type(endUnix, Union(Int, NULL)));
        // array, and each elmenent is an instance's array of due dates
        let dueDates = [];
        let i = 0;
        for (const instance of this.instances) {
            if (type(instance, NonRecurringTaskInstance)) {
                // add this array to the dueDates array
                let dueDate = instance.getDueDate();
                if (dueDate >= startUnix && dueDate <= endUnix) {
                    dueDates.push([{date : dueDate, completed : instance.completion}]);
                }
            } else if (type(instance, RecurringTaskInstance)) {
                let arr = [];
                for (const date of instance.getDueDatesInRange(startUnix, endUnix)) {
                    arr.push({date : date, completed : instance.completion.includes(date)});
                }
                dueDates.push(arr);
            }
            i++;
        }
        return dueDates;
    }

    isComplete(startUnix, endUnix) {
        ASSERT(type(this, TaskData));
        ASSERT(type(startUnix, Union(Int, NULL)));
        ASSERT(type(endUnix, Union(Int, NULL)));
        for (const instance of this.instances) {
            if (type(instance, NonRecurringTaskInstance)) {
                if (!instance.isComplete(startUnix, endUnix)) {
                    return false;
                }
            } else if (type(instance, RecurringTaskInstance)) {
                if (!instance.isComplete(startUnix, endUnix)) {
                    return false;
                }
            }
        }
        return true;
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

    // Parse AI-supplied JSON for a task structure (uppermost level for a task).
    // Expected minimal schema (per docs):
    // {
    //   "type": "task",
    //   "instances": [ { ... } ],
    //   "work_sessions": [ ... ] // optional
    // }
    static fromAiJson(json) {
        ASSERT(exists(json));
        ASSERT(json.type === 'task', 'TaskData.fromAiJson: json.type must be "task"');

        // --- INSTANCES ---
        ASSERT(Array.isArray(json.instances) && json.instances.length > 0, 'TaskData.fromAiJson: instances array required');
        const instances = [];
        for (const inst of json.instances) {
            ASSERT(exists(inst) && type(inst.type, NonEmptyString), 'TaskData.fromAiJson: each instance needs a type');
            if (inst.type === 'due_date_instance') {
                instances.push(NonRecurringTaskInstance.fromAiJson(inst));
            } else if (inst.type === 'due_date_pattern') {
                instances.push(RecurringTaskInstance.fromAiJson(inst));
            } else {
                ASSERT(false, 'TaskData.fromAiJson: unknown instance type ' + String(inst.type));
            }
        }

        // --- WORK SESSIONS ---
        let workSessions = [];
        if (!AiReturnedNullField(json.work_sessions)) {
            ASSERT(Array.isArray(json.work_sessions), 'TaskData.fromAiJson: work_sessions must be array');
            for (const ws of json.work_sessions) {
                ASSERT(exists(ws) && type(ws.type, NonEmptyString), 'TaskData.fromAiJson: each work_session needs a type');
                if (ws.type === 'event_instance') {
                    workSessions.push(NonRecurringEventInstance.fromAiJson(ws));
                } else if (ws.type === 'event_pattern') {
                    workSessions.push(RecurringEventInstance.fromAiJson(ws));
                } else {
                    ASSERT(false, 'TaskData.fromAiJson: unknown work_session type ' + String(ws.type));
                }
            }
        }

        return new TaskData(instances, NULL, true, workSessions);
    }
}

class EventData {
    constructor(instances) {
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

    // Parse AI-supplied JSON for an event structure.
    // Schema:
    // {
    //   "type": "event",
    //   "instances": [ { ... } ]
    // }
    static fromAiJson(json) {
        ASSERT(exists(json));
        ASSERT(json.type === 'event', 'EventData.fromAiJson: json.type must be "event"');

        ASSERT(Array.isArray(json.instances) && json.instances.length > 0, 'EventData.fromAiJson: instances array required');
        const instances = [];
        for (const inst of json.instances) {
            ASSERT(exists(inst) && type(inst.type, NonEmptyString), 'EventData.fromAiJson: each instance needs a type');
            if (inst.type === 'event_instance') {
                instances.push(NonRecurringEventInstance.fromAiJson(inst));
            } else if (inst.type === 'event_pattern') {
                instances.push(RecurringEventInstance.fromAiJson(inst));
            } else {
                ASSERT(false, 'EventData.fromAiJson: unknown instance type ' + String(inst.type));
            }
        }

        return new EventData(instances);
    }
}

// Reminder Instances
class NonRecurringReminderInstance {
    constructor(date, time) {
        ASSERT(type(date, DateField));
        ASSERT(type(time, TimeField));

        this.date = date;
        this.time = time;
    }

    toJson() {
        ASSERT(type(this, NonRecurringReminderInstance));
        return {
            date: this.date.toJson(),
            time: this.time.toJson(),
            _type: 'NonRecurringReminderInstance'
        };
    }

    static fromJson(json) {
        ASSERT(exists(json));
        return new NonRecurringReminderInstance(DateField.fromJson(json.date), TimeField.fromJson(json.time));
    }

    // AI JSON: { "type":"reminder_instance", "date":"YYYY-MM-DD", "time":"HH:MM" }
    static fromAiJson(json) {
        ASSERT(exists(json));
        ASSERT(json.type === 'reminder_instance', 'NonRecurringReminderInstance.fromAiJson: json.type must be "reminder_instance"');
        ASSERT(!AiReturnedNullField(json.date), 'NonRecurringReminderInstance.fromAiJson: date required');
        ASSERT(!AiReturnedNullField(json.time), 'NonRecurringReminderInstance.fromAiJson: time required');
        const date = DateField.fromYYYY_MM_DD(json.date);
        const parts = json.time.split(':');
        ASSERT(parts.length === 2, 'NonRecurringReminderInstance.fromAiJson: time must be HH:MM');
        const time = new TimeField(Number(parts[0]), Number(parts[1]));
        return new NonRecurringReminderInstance(date, time);
    }
}

class RecurringReminderInstance {
    constructor(datePattern, time, range) {
        ASSERT(type(datePattern, Union(EveryNDaysPattern, MonthlyPattern, AnnuallyPattern, NthWeekdayOfMonthsPattern)));
        ASSERT(type(time, TimeField));
        ASSERT(type(range, Union(DateRange, RecurrenceCount)));

        this.datePattern = datePattern;
        this.time = time;
        this.range = range;
    }

    toJson() {
        ASSERT(type(this, RecurringReminderInstance));
        return {
            datePattern: this.datePattern.toJson(),
            time: this.time.toJson(),
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
        } else if (json.datePattern._type === 'NthWeekdayOfMonthsPattern') {
            datePattern = NthWeekdayOfMonthsPattern.fromJson(json.datePattern);
        } else {
            ASSERT(false, 'Unknown datePattern type in RecurringReminderInstance.fromJson');
        }

        let time = TimeField.fromJson(json.time);

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

    // AI JSON: {
    //   "type": "reminder_pattern",
    //   "date": { ... },
    //   "time": "HH:MM",
    //   "range": "YYYY-MM-DD:YYYY-MM-DD" | int
    // }
    static fromAiJson(json) {
        ASSERT(exists(json));
        ASSERT(json.type === 'reminder_pattern', 'RecurringReminderInstance.fromAiJson: json.type must be "reminder_pattern"');
        ASSERT(exists(json.date_pattern), 'RecurringReminderInstance.fromAiJson: date_pattern required');
        const dp = json.date_pattern;
        let datePattern;
        if (dp.type === 'every_n_days_pattern') {
            datePattern = EveryNDaysPattern.fromAiJson(dp);
        } else if (dp.type === 'monthly_pattern') {
            datePattern = MonthlyPattern.fromAiJson(dp);
        } else if (dp.type === 'annually_pattern') {
            datePattern = AnnuallyPattern.fromAiJson(dp);
        } else if (dp.type === 'nth_weekday_of_months_pattern') {
            datePattern = NthWeekdayOfMonthsPattern.fromAiJson(dp);
        } else {
            ASSERT(false, 'RecurringReminderInstance.fromAiJson: unknown date_pattern.type ' + String(dp.type));
        }

        // time mandatory for reminders
        ASSERT(!AiReturnedNullField(json.time), 'RecurringReminderInstance.fromAiJson: time required');
        const parts = json.time.split(':');
        ASSERT(parts.length === 2, 'RecurringReminderInstance.fromAiJson: time must be HH:MM');
        const time = new TimeField(Number(parts[0]), Number(parts[1]));

        // range mandatory
        ASSERT(!AiReturnedNullField(json.range), 'RecurringReminderInstance.fromAiJson: range required');
        let range;
        if (typeof json.range === 'string') {
            const rparts = json.range.split(':');
            ASSERT(rparts.length === 2, 'RecurringReminderInstance.fromAiJson: range string must be "start:end"');
            const startDate = DateField.fromYYYY_MM_DD(rparts[0]);
            let endDate;
            if (AiReturnedNullField(rparts[1]) || rparts[1] === '') {
                endDate = NULL;
            } else {
                endDate = DateField.fromYYYY_MM_DD(rparts[1]);
            }
            range = new DateRange(startDate, endDate);
        } else {
            const count = Number(json.range);
            ASSERT(type(count, Int) && count > 0, 'RecurringReminderInstance.fromAiJson: numeric range must positive int');
            ASSERT(dp.type === 'every_n_days_pattern', 'RecurringReminderInstance.fromAiJson: numeric range only allowed with every_n_days_pattern');
            range = new RecurrenceCount(datePattern.initialDate, count);
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

    // AI JSON schema: { "type":"reminder", "instances": [ ... ] }
    static fromAiJson(json) {
        ASSERT(exists(json));
        ASSERT(json.type === 'reminder', 'ReminderData.fromAiJson: json.type must be "reminder"');
        ASSERT(Array.isArray(json.instances) && json.instances.length > 0, 'ReminderData.fromAiJson: instances array required');
        const instances = [];
        for (const inst of json.instances) {
            ASSERT(exists(inst) && type(inst.type, NonEmptyString), 'ReminderData.fromAiJson: each instance needs a type');
            if (inst.type === 'reminder_instance') {
                instances.push(NonRecurringReminderInstance.fromAiJson(inst));
            } else if (inst.type === 'reminder_pattern') {
                instances.push(RecurringReminderInstance.fromAiJson(inst));
            } else {
                ASSERT(false, 'ReminderData.fromAiJson: unknown instance type ' + String(inst.type));
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
            _type: 'Entity'
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
            ASSERT(false, 'Unknown data type in Entity.fromJson.');
        }
        return new Entity(json.id, json.name, json.description, data);
    }

    // Utility to generate a simple unique ID (timestamp + random)
    static _generateId() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let id = '';
        for (let i = 0; i < 8; i++) {
            id += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return id;
    }

    // Convert an array of AI JSON objects (tasks, events, reminders) into an array of Entity instances.
    // Each AI object must include at least { type: "task"|"event"|"reminder", name: "...", ... }
    static fromAiJson(aiObject) {
        ASSERT(exists(aiObject) && type(aiObject, Object), 'Entity.fromAiJson: expected an object');
        ASSERT(type(aiObject.type, NonEmptyString), 'Entity.fromAiJson: each item must have a type');
        ASSERT(!AiReturnedNullField(aiObject.name), 'Entity.fromAiJson: each item must have a name');
        const name = aiObject.name;
        const description = AiReturnedNullField(aiObject.description) ? '' : aiObject.description;

        let data;
        if (aiObject.type === 'task') {
            data = TaskData.fromAiJson(aiObject);
        } else if (aiObject.type === 'event') {
            data = EventData.fromAiJson(aiObject);
        } else if (aiObject.type === 'reminder') {
            data = ReminderData.fromAiJson(aiObject);
        } else {
            ASSERT(false, 'Entity.fromAiJson: unknown item type ' + String(aiObject.type));
        }

        const id = Entity._generateId();
        let newEntity = NULL;
        try {
            newEntity = new Entity(id, name, description, data);
        } catch (e) {
            log("Entity.fromAiJson: error creating entity " + id + " " + name + " " + description + " " + data);
            log(e);
            return NULL;
        }

        if (type(newEntity, Entity)) {
            return newEntity;
        } else {
            return NULL;
        }
    }
}

// User class to encapsulate all user data
class User {
    constructor(entityArray, settings, palette, userId, email, usage, timestamp, plan, paymentTimes) {
        ASSERT(type(entityArray, List(Entity)));
        ASSERT(type(settings, Dict(String, Union(Boolean, Int, String))));
        ASSERT(type(palette, Dict(String, List(String))));
        ASSERT(type(userId, Union(String, NULL)));
        ASSERT(type(email, Union(String, NULL)));
        ASSERT(type(usage, Int));
        ASSERT(usage >= 0);
        ASSERT(type(plan, String));
        ASSERT(plan === "free" || plan === "pro");
        ASSERT(type(timestamp, Int));
        ASSERT(timestamp >= 0);
        ASSERT(type(paymentTimes, List(Int)));
        for (const paymentTime of paymentTimes) {
            ASSERT(paymentTime >= 0);
        }

        // Assert that both userId and email are null, or both are non-null
        ASSERT((userId === NULL && email === NULL) || (userId !== NULL && email !== NULL), "userId and email must both be null or both be non-null");
        
        // Validate settings structure
        ASSERT(settings.ampmOr24 === 'ampm' || settings.ampmOr24 === '24');
        // how many hours to offset
        ASSERT(type(settings.startOfDayOffset, Int) && -12 <= settings.startOfDayOffset && settings.startOfDayOffset <= 12);
        ASSERT(type(settings.endOfDayOffset, Int) && -12 <= settings.endOfDayOffset && settings.endOfDayOffset <= 12);
        
        // Validate palette structure
        ASSERT(type(palette.accent, List(String)));
        ASSERT(type(palette.shades, List(String)));
        ASSERT(type(palette.events, List(String)));
        ASSERT(palette.accent.length === 2);
        ASSERT(palette.shades.length === 5);
        ASSERT(palette.events.length === 5);
        
        this.entityArray = entityArray;
        this.settings = settings;
        this.palette = palette;
        this.userId = userId;
        this.email = email;
        this.usage = usage;
        this.timestamp = timestamp;
        this.plan = plan;
        this.paymentTimes = paymentTimes;
    }

    // this is how we store the user in the DB
    // note that we only need to query userId and email,
    // so everything else is stored as a single string in the DB
    // dataspec integer is just so we can migrate data
    // note that we also don't store LocalData, which is basically
    // prefernces on a per-device basis, not a per-user basis
    toJson() {
        ASSERT(type(this, User));
        let entityArrayJson = [];
        for (const entity of this.entityArray) {
            entityArrayJson.push(entity.toJson());
        }
        return {
            // this is all stored as a single string in the DB
            // TODO: optimize to store more efficiently
            data: JSON.stringify({
                entityArray: entityArrayJson,
                settings: this.settings,
                palette: this.palette,
            }),
            // these have their own columns in the DB
            userId: this.userId === NULL ? symbolToJson(NULL) : this.userId,
            email: this.email === NULL ? symbolToJson(NULL) : this.email,
            dataspec: 1, // first dataspec version
            usage: this.usage,
            timestamp: this.timestamp,
            plan: this.plan,
            paymentTimes: this.paymentTimes,
            _type: 'User'
        };
    }

    static fromJson(json) {
        ASSERT(exists(json));
        ASSERT(json._type === 'User');
        ASSERT(exists(json.data));
        ASSERT(type(json.data, String));
        let dataString;
        // the backend returns this if a user was just created
        if (json.data == '{}') {
            // use the default user data
            dataString = User.createDefault().toJson().data;
        } else {
            dataString = json.data;
        }
        let data = JSON.parse(dataString);
        ASSERT(exists(data.entityArray));
        ASSERT(type(data.entityArray, List(Object)));
        ASSERT(exists(data.settings));
        ASSERT(type(data.settings.startOfDayOffset, Int));
        ASSERT(type(data.settings.endOfDayOffset, Int));
        ASSERT(type(data.settings.ampmOr24, String));
        ASSERT(data.settings.ampmOr24 === 'ampm' || data.settings.ampmOr24 === '24');
        ASSERT(exists(data.palette));
        ASSERT(type(data.palette.accent, List(String)));
        ASSERT(type(data.palette.shades, List(String)));
        ASSERT(type(data.palette.events, List(String)));
        ASSERT(data.palette.accent.length === 2);
        ASSERT(data.palette.shades.length === 5);
        ASSERT(data.palette.events.length === 5);
        ASSERT(type(json.dataspec, Int));
        ASSERT(json.userId === symbolToJson(NULL) || type(json.userId, String));
        ASSERT(json.email === symbolToJson(NULL) || type(json.email, String));
        ASSERT(type(json.usage, Int));
        ASSERT(json.usage >= 0);
        ASSERT(type(json.timestamp, Int));
        ASSERT(type(json.plan, String));
        ASSERT(json.plan === "free" || json.plan === "pro");
        ASSERT(type(json.paymentTimes, List(Int)));
        
        for (const paymentTime of json.paymentTimes) {
            ASSERT(paymentTime >= 0);
        }

        if (json.dataspec === 1) {
            let entityArray = [];
            for (const entityJson of data.entityArray) {
                entityArray.push(Entity.fromJson(entityJson));
            }

            return new User(
                entityArray,
                data.settings,
                data.palette,
                json.userId,
                json.email,
                json.usage,
                json.timestamp,
                json.plan,
                json.paymentTimes
            );
        } else {
            // we only have one dataspec for now
            // parsing will be added for each dataspec later
            // this is how data migration is done *client-side* yippee
            // also results in zero downtime for users
            ASSERT(false, "Only dataspec 1 is supported");
        }
    }

    static createDefault() {
        return new User(
            [], // empty entityArray
            {
                ampmOr24: 'ampm',
                startOfDayOffset: 0,
                endOfDayOffset: 0,
            },
            palettes.dark,
            NULL, // userId
            NULL, // email
            0, // usage
            Date.now(), // timestamp
            "free", // plan
            [] // paymentTimes
        );
    }
}

// String format symbols for date components
const YYYY_MM_DD = Symbol('YYYY_MM_DD');
const YYYY = Symbol('YYYY');
const MM = Symbol('MM');
const DD = Symbol('DD');
const DAY_OF_WEEK = Symbol('DAY_OF_WEEK');

// New Symbols for the things that could generate a FilteredInstance
const TaskWorkSessionKind = Symbol('TaskWorkSessionKind');
const EventInstanceKind = Symbol('EventInstanceKind');
const ReminderInstanceKind = Symbol('ReminderInstanceKind');

// the Filtered data types are simplifications of the original data that are easy to render
// they are essentially rasterizations of the patterns
// FilteredSegmentOfDayInstance class for calendar rendering
class FilteredSegmentOfDayInstance {
    constructor(id, name, startDateTime, endDateTime, originalStartDate, originalStartTime, wrapToPreviousDay, wrapToNextDay, instanceKind, taskIsComplete, patternIndex, ambiguousEndTime, ui = {}) {
        ASSERT(type(id, NonEmptyString));
        ASSERT(type(name, String)); // Name can be empty for some generated items if needed
        ASSERT(type(startDateTime, Int));
        ASSERT(type(endDateTime, Int));
        ASSERT(startDateTime <= endDateTime, "FilteredSegmentOfDayInstance: startDateTime must be less than or equal to endDateTime");
        ASSERT(type(originalStartDate, DateField));
        ASSERT(type(originalStartTime, Union(TimeField, NULL)));
        ASSERT(type(wrapToPreviousDay, Boolean));
        ASSERT(type(wrapToNextDay, Boolean));
        ASSERT([TaskWorkSessionKind, EventInstanceKind].includes(instanceKind), "FilteredSegmentOfDayInstance: instanceKind must be TaskWorkSessionKind or EventInstanceKind. Received: " + String(instanceKind));
        ASSERT(type(taskIsComplete, Union(Boolean, NULL)));
        if (instanceKind !== TaskWorkSessionKind) {
            ASSERT(taskIsComplete === NULL, "taskIsComplete must be NULL if not a TaskWorkSessionKind");
        }
        ASSERT(type(patternIndex, Int));
        ASSERT(type(ambiguousEndTime, Boolean));
        ASSERT(type(ui, Dict(String, Union(String, Int, Boolean, NULL, List(Type), Dict(String, Type)))));

        this.id = id;
        this.name = name;
        this.startDateTime = startDateTime;
        this.endDateTime = endDateTime;
        this.originalStartDate = originalStartDate;
        this.originalStartTime = originalStartTime;
        this.wrapToPreviousDay = wrapToPreviousDay;
        this.wrapToNextDay = wrapToNextDay;
        this.instanceKind = instanceKind;
        this.taskIsComplete = taskIsComplete;
        this.patternIndex = patternIndex;
        this.ambiguousEndTime = ambiguousEndTime;
        this.ui = ui;
    }

    // No toJson or fromJson because these aren't stored long-term
}

// FilteredAllDayInstance class for calendar rendering (all-day section)
class FilteredAllDayInstance {
    constructor(id, name, date, instanceKind, taskIsComplete, ignore, patternIndex, ui = {}) {
        ASSERT(type(id, NonEmptyString));
        ASSERT(type(name, String));
        ASSERT(type(date, DateField));
        ASSERT([TaskWorkSessionKind, EventInstanceKind].includes(instanceKind), "FilteredAllDayInstance: instanceKind must be TaskWorkSessionKind or EventInstanceKind. Received: " + String(instanceKind));
        ASSERT(type(taskIsComplete, Union(Boolean, NULL)));
        if (instanceKind !== TaskWorkSessionKind) {
            ASSERT(taskIsComplete === NULL, "taskIsComplete must be NULL if not a TaskWorkSessionKind");
        }
        ASSERT(type(ignore, Boolean));
        ASSERT(type(patternIndex, Int));
        ASSERT(type(ui, Dict(String, Union(String, Int, Boolean, NULL, List(Type), Dict(String, Type)))));

        this.id = id;
        this.name = name;
        this.date = date;
        this.instanceKind = instanceKind;
        this.taskIsComplete = taskIsComplete;
        this.ignore = ignore;
        this.patternIndex = patternIndex;
        this.ui = ui;
    }

    // No toJson or fromJson needed
}

// FilteredReminderInstance class for calendar rendering
class FilteredReminderInstance {
    constructor(id, name, dateTime, originalDate, originalTime, patternIndex, ui = {}) {
        ASSERT(type(id, NonEmptyString));
        ASSERT(type(name, String));
        ASSERT(type(dateTime, Int)); // Unix timestamp for the reminder's time
        ASSERT(type(originalDate, DateField)); // The original date from the pattern or non-recurring instance
        ASSERT(type(originalTime, TimeField));
        ASSERT(type(patternIndex, Int));
        ASSERT(type(ui, Dict(String, Union(String, Int, Boolean, NULL, List(Type), Dict(String, Type)))));

        this.id = id;
        this.name = name;
        this.dateTime = dateTime;
        this.originalDate = originalDate;
        this.originalTime = originalTime;
        this.patternIndex = patternIndex;
        this.ui = ui;
    }

    // No toJson or fromJson needed
}

// LocalData class for managing local storage state
class LocalData {
    static isLoaded = false;

    // default values
    static stacking = false;
    static numberOfDays = 2;
    static signedIn = false;
    static token = NULL;
    
    // Prevent instantiation
    constructor() {
        ASSERT(false, "LocalData cannot be instantiated");
    }
    
    // Simple encryption/decryption using XOR with static salt
    static encryptToken(token) {
        if (!token) return NULL;
        
        // Static salt for basic obfuscation
        const salt = "scribblit_secure_salt_2024_v1";
        let encrypted = "";
        
        for (let i = 0; i < token.length; i++) {
            const charCode = token.charCodeAt(i);
            const saltChar = salt.charCodeAt(i % salt.length);
            encrypted += String.fromCharCode(charCode ^ saltChar);
        }
        
        // Base64 encode to make it look like random data
        return btoa(encrypted);
    }

    static decryptToken(encryptedToken) {
        if (!encryptedToken) return NULL;
        
        try {
            // Decode from base64
            const encrypted = atob(encryptedToken);
            
            // Static salt (same as encryption)
            const salt = "scribblit_secure_salt_2024_v1";
            let decrypted = "";
            
            for (let i = 0; i < encrypted.length; i++) {
                const charCode = encrypted.charCodeAt(i);
                const saltChar = salt.charCodeAt(i % salt.length);
                decrypted += String.fromCharCode(charCode ^ saltChar);
            }
            
            return decrypted;
        } catch (error) {
            log("ERROR decrypting token: " + error.message);
            return NULL;
        }
    }
    
    static load() {
        const localData = localStorage.getItem("localData");
        if (exists(localData)) {
            try {
                const data = JSON.parse(localData);
                ASSERT(type(data.stacking, Boolean), "LocalData.stacking must be Boolean");
                ASSERT(type(data.numberOfDays, Int), "LocalData.numberOfDays must be Int");
                ASSERT(type(data.signedIn, Boolean), "LocalData.signedIn must be Boolean");
                
                this.stacking = data.stacking;
                this.numberOfDays = data.numberOfDays;
                this.signedIn = data.signedIn;
                
                // Handle encrypted token
                if (data.token) {
                    this.token = LocalData.decryptToken(data.token);
                } else {
                    this.token = NULL;
                }
            } catch (error) {
                log("ERROR parsing localData, using defaults: " + error.message);
                // Keep default values if parsing fails
            }
        }
        this.isLoaded = true;
        this.set('stacking', this.stacking);
        this.set('numberOfDays', this.numberOfDays);
        this.set('signedIn', this.signedIn);
        if (this.token) {
            this.set('token', this.token);
        }
    }
    
    static get(key) {
        ASSERT(this.isLoaded, "LocalData must be loaded before getting values");
        ASSERT(type(key, String), "LocalData.get() key must be String");
        
        if (key === 'stacking') {
            return this.stacking;
        } else if (key === 'numberOfDays') {
            return this.numberOfDays;
        } else if (key === 'signedIn') {
            return this.signedIn;
        } else if (key === 'token') {
            return this.token;
        } else {
            ASSERT(false, "LocalData.get() key must be stacking, numberOfDays, signedIn, or token");
        }
    }
    
    static set(key, value) {
        ASSERT(this.isLoaded, "LocalData must be loaded before setting values");
        ASSERT(type(key, String), "LocalData.set() key must be String");
        
        if (key === 'stacking') {
            ASSERT(type(value, Boolean), "LocalData.stacking must be Boolean");
            this.stacking = value;
        } else if (key === 'numberOfDays') {
            ASSERT(type(value, Int), "LocalData.numberOfDays must be Int");
            ASSERT(1 <= value && value <= 7, "LocalData.numberOfDays must be between 1 and 7");
            this.numberOfDays = value;
        } else if (key === 'signedIn') {
            ASSERT(type(value, Boolean), "LocalData.signedIn must be Boolean");
            this.signedIn = value;
        } else if (key === 'token') {
            ASSERT(value === NULL || type(value, String), "LocalData.token must be String or NULL");
            this.token = value;
        } else {
            ASSERT(false, "LocalData.set() key must be stacking, numberOfDays, signedIn, or token");
        }
        
        // Save to localStorage
        const data = {
            stacking: this.stacking,
            numberOfDays: this.numberOfDays,
            signedIn: this.signedIn
        };
        
        // Encrypt token before storing
        if (this.token) {
            data.token = LocalData.encryptToken(this.token);
        }
        
        localStorage.setItem("localData", JSON.stringify(data));
    }
}

// type checking function
function type(thing, sometype) {
    ASSERT(exists(thing), "found thing that doesn't exist while type checking: " + String(thing));
    ASSERT(exists(sometype), "found some type that doesn't exist while type checking: " + String(sometype));
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
        try { new MonthlyPattern(thing.day, thing.months); return true; } catch (e) { return false; }
    } else if (sometype === AnnuallyPattern) {
        if (!(thing instanceof AnnuallyPattern)) return false;
        try { new AnnuallyPattern(thing.month, thing.day); return true; } catch (e) { return false; }
    } else if (sometype === NthWeekdayOfMonthsPattern) {
        if (!(thing instanceof NthWeekdayOfMonthsPattern)) return false;
        try { new NthWeekdayOfMonthsPattern(thing.dayOfWeek, thing.nthWeekdays, thing.months); return true; } catch (e) { return false; }
    } else if (sometype === DateRange) {
        if (!(thing instanceof DateRange)) return false;
        try { new DateRange(thing.startDate, thing.endDate); return true; } catch (e) { return false; }
    } else if (sometype === RecurrenceCount) {
        if (!(thing instanceof RecurrenceCount)) return false;
        try { new RecurrenceCount(DateField.fromJson(thing.initialDate), thing.count); return true; } catch (e) { return false; }
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
    } else if (sometype === FilteredSegmentOfDayInstance) {
        if (!(thing instanceof FilteredSegmentOfDayInstance)) return false;
        try { new FilteredSegmentOfDayInstance(thing.id, thing.name, thing.startDateTime, thing.endDateTime, thing.originalStartDate, thing.originalStartTime, thing.wrapToPreviousDay, thing.wrapToNextDay, thing.instanceKind, thing.taskIsComplete, thing.patternIndex, thing.ambiguousEndTime, thing.ui); return true; } catch (e) { return false; }
    } else if (sometype === FilteredAllDayInstance) {
        if (!(thing instanceof FilteredAllDayInstance)) return false;
        try { new FilteredAllDayInstance(thing.id, thing.name, thing.date, thing.instanceKind, thing.taskIsComplete, thing.ignore, thing.patternIndex, thing.ui); return true; } catch (e) { return false; }
    } else if (sometype === FilteredReminderInstance) {
        if (!(thing instanceof FilteredReminderInstance)) return false;
        try { new FilteredReminderInstance(thing.id, thing.name, thing.dateTime, thing.originalDate, thing.originalTime, thing.patternIndex, thing.ui); return true; } catch (e) { return false; }
    } else if (sometype === Entity) {
        if (!(thing instanceof Entity)) return false;
        try { new Entity(thing.id, thing.name, thing.description, thing.data); return true; } catch (e) { return false; }
    } else if (sometype === User) {
        if (!(thing instanceof User)) return false;
        try { new User(thing.entityArray, thing.settings, thing.palette, thing.userId, thing.email, thing.usage, thing.timestamp, thing.plan, []); return true; } catch (e) { return false; }
    }
    // Primitive type checks
    else if (sometype === Number) return typeof thing === 'number';
    else if (sometype === String) return typeof thing === 'string';
    else if (sometype === Boolean) return typeof thing === 'boolean';
    else if (sometype === Symbol) return typeof thing === 'symbol';
    else if (sometype === BigInt) return typeof thing === 'bigint';
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
    } else if (sometype === TaskWorkSessionKind) {
        return typeof thing === 'symbol' && thing === TaskWorkSessionKind;
    } else if (sometype === EventInstanceKind) {
        return typeof thing === 'symbol' && thing === EventInstanceKind;
    } else if (sometype === ReminderInstanceKind) {
        return typeof thing === 'symbol' && thing === ReminderInstanceKind;
    } else if (sometype === LAST_WEEK_OF_MONTH) {
        return typeof thing === 'symbol' && thing === LAST_WEEK_OF_MONTH;
    } else {
        return thing instanceof sometype;
    }
}