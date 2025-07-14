let TESTING = false;
let TESTING_USER_IS_EMPTY = false;
let TESTING_SHOW_LOGS = true;

function ASSERT(condition, message="") {
    if (typeof(condition) != "boolean") {
        console.error('MALFORMED ASSERTION');
        console.trace();
    } else if (!condition && TESTING_SHOW_LOGS) {
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
    dark: { // default
        accent: ['#4a83ff', '#c64aff'],
        events: ['#3a506b', '#5b7553', '#7e4b4b', '#4f4f6b', '#6b5b4f'],
        shades: ['#191919', '#383838', '#464646', '#9e9e9e', '#ffffff']
    },
    midnight: {
        accent: ['#a82190', '#003fd2'],
        events: ['#47b6ff', '#b547ff'],
        shades: ['#000000', '#6e6e6e', '#d1d1d1', '#9e9e9e', '#ffffff']
    },
    notebook: {
        accent: ['#75a3ff', '#ffea00'],
        events: ['#adffaf', '#d09eff', '#ffa8a8', '#4f4f6b', '#6b5b4f'],
        shades: ['#ffffff', '#bdbdbd', '#777777', '#919191', '#545454']
    }
};

const charactersPerToken = 4.82; // https://drchrislevy.github.io/posts/agents/agents.html#characters-per-token

function symbolToString(symbol) {
    ASSERT(typeof symbol === 'symbol', "symbolToString expects a symbol.");
    ASSERT(exists(symbol.description) && symbol.description.length > 0, "Symbol for JSONification must have a description.");
    return '$' + symbol.description + ')';
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

function randomAlphabetString(length) {
    ASSERT(type(length, Int), "randomAlphabetString: length must be an integer");
    ASSERT(length > 0, "randomAlphabetString: length must be positive");
    return Array.from({ length }, () => String.fromCharCode(Math.floor(Math.random() * 26) + 97)).join('');
}

const defaultCutoffUnix = 1947483647; // about the year 2031

// One day in milliseconds.
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Helper: given a DateField and optional TimeField, return the exact Unix timestamp at which the
// entity is considered due.  When no time is supplied we treat the due moment as the final
// millisecond of that day (23:59:59.999) so that tasks scheduled for "today" are not prematurely
// marked done until the entire day has elapsed.
function dueUnixTimestamp(dateField, timeField) {
    ASSERT(type(dateField, DateField), "dueUnixTimestamp: dateField must be a DateField");
    ASSERT(type(timeField, Union(TimeField, NULL)), "dueUnixTimestamp: timeField must be TimeField or NULL");

    // Midnight (local) for the given day.
    const base = dateField.toUnixTimestamp();

    if (timeField === NULL) {
        // End of the day.
        return base + MS_PER_DAY - 1;
    } else {
        // Specific time during the day.
        return base + ((timeField.hour * 60 + timeField.minute) * 60 * 1000);
    }
}

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
        ASSERT(type(year, Int), "DateField constructor: year must be an integer: " + year);
        
        ASSERT(type(month, Int), "DateField constructor: month must be an integer: " + month);
        ASSERT(month >= 1 && month <= 12);
        
        ASSERT(type(day, Int), "DateField constructor: day must be an integer: " + day);
        ASSERT(day >= 1 && day <= 31);

        if (month === 2 && day > 29) {
            ASSERT(false, "DateField constructor: February has at most 29 days");
        }
        
        // Additional validation for days in month (including leap years)
        const daysInMonth = new Date(year, month, 0).getDate();
        ASSERT(day <= daysInMonth, "DateField constructor: day must be less than or equal to the number of days in the month: " + JSON.stringify({ year, month, day, daysInMonth }));
        
        this.year = year;
        this.month = month;
        this.day = day;
    }

    toUnixTimestamp() {
        ASSERT(type(this, DateField));
        return (new Date(this.year, this.month - 1, this.day)).getTime();
    }

    encode() {
        ASSERT(type(this, DateField));
        return {
            year: this.year,
            month: this.month,
            day: this.day,
            _type: 'DateField'
        };
    }

    static decode(json) {
        ASSERT(exists(json));
        return new DateField(json.year, json.month, json.day);
    }

    static fromYYYY_MM_DD(dateString) {
        // assertions
        ASSERT(type(dateString, YYYY_MM_DD));
        ASSERT(dateString.length === 10);
        ASSERT(dateString[4] === '-' && dateString[7] === '-');
        const parts = dateString.split('-');
        return new DateField(Number(parts[0]), Number(parts[1]), Number(parts[2]));
    }

    // Unsafe variant: returns NULL instead of throwing assertions on invalid input.
    static fromYYYY_MM_DDUnsafe(dateString) {
        if(AiReturnedNullField(dateString)) {
            return NULL;
        }
        if(!type(dateString, YYYY_MM_DD)) {
            return NULL;
        }
        if(dateString.length !== 10 || dateString[4] !== '-' || dateString[7] !== '-') {
            return NULL;
        }
        const parts = dateString.split('-');
        const year = Number(parts[0]);
        const month = Number(parts[1]);
        const day = Number(parts[2]);
        if(!(type(year, Int) && type(month, Int) && type(day, Int))) {
            return NULL;
        }
        try {
            return new DateField(year, month, day);
        } catch (e) {
            return NULL;
        }
    }

    static unsafeConstruct(year, month, day) {
        if(!type(year, Int) || !type(month, Int) || !type(day, Int)) {
            return NULL;
        }

        if (month < 1 || month > 12 || day < 1 || day > 31) {
            return NULL;
        }

        if (month === 2 && day > 29) {
            return NULL;
        }

        return new DateField(year, month, day);
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

    encode() {
        ASSERT(type(this, TimeField));
        return {
            hour: this.hour,
            minute: this.minute,
            _type: 'TimeField'
        };
    }

    static decode(json) {
        ASSERT(exists(json));
        return new TimeField(json.hour, json.minute);
    }

    static unsafeConstruct(hour, minute) {
        if(!type(hour, Int) || !type(minute, Int)) {
            return NULL;
        }
        if(hour < 0 || hour > 23 || minute < 0 || minute > 59) {
            return NULL;
        }
        return new TimeField(hour, minute);
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

    encode() {
        ASSERT(type(this, EveryNDaysPattern));
        return {
            initialDate: this.initialDate.encode(),
            n: this.n,
            _type: 'EveryNDaysPattern'
        };
    }

    static decode(json) {
        ASSERT(exists(json));
        return new EveryNDaysPattern(DateField.decode(json.initialDate), json.n);
    }

    // range is only relevant for weekly_pattern
    static fromAiJson(json, range) {
        if(!exists(json)) {
            return NULL;
        }

        if (json.type === 'weekly_pattern') {
            if(AiReturnedNullField(json.every_n_weeks) || !type(Number(json.every_n_weeks), Int) || Number(json.every_n_weeks) <= 0) {
                log('EveryNDaysPattern.fromAiJson: weekly_pattern requires a positive integer every_n_weeks');
                return NULL;
            }
            if(AiReturnedNullField(json.day_of_week) || !type(json.day_of_week, DAY_OF_WEEK)) {
                log('EveryNDaysPattern.fromAiJson: weekly_pattern requires a valid day_of_week');
                return NULL;
            }

            if (range === NULL) {
                log('EveryNDaysPattern.fromAiJson: range is required for weekly_pattern');
                return NULL;
            }
            
            let startDate;
            if (typeof range === 'string') {
                const parts = range.split(':');
                if(parts.length !== 2) {
                    log('EveryNDaysPattern.fromAiJson: range string must be "start:end" for weekly_pattern');
                    return NULL;
                }
                startDate = DateField.fromYYYY_MM_DDUnsafe(parts[0]);
                if (startDate === NULL) {
                    log('EveryNDaysPattern.fromAiJson: invalid range start date format for weekly_pattern');
                    return NULL;
                }
            } else {
                log('EveryNDaysPattern.fromAiJson: weekly_pattern requires a date range string, not a number.');
                return NULL;
            }

            const dayOfWeekStrings = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
            const targetDay = dayOfWeekStrings.indexOf(json.day_of_week);

            let currentDateObj = new Date(Date.UTC(startDate.year, startDate.month - 1, startDate.day));
            while (currentDateObj.getUTCDay() !== targetDay) {
                currentDateObj.setUTCDate(currentDateObj.getUTCDate() + 1);
            }

            const initialDate = new DateField(currentDateObj.getUTCFullYear(), currentDateObj.getUTCMonth() + 1, currentDateObj.getUTCDate());

            const n = Number(json.every_n_weeks) * 7;
            const everyNDaysPatternJson = {
                type: 'every_n_days_pattern',
                initial_date: `${initialDate.year}-${String(initialDate.month).padStart(2, '0')}-${String(initialDate.day).padStart(2, '0')}`,
                n: n
            };
            return EveryNDaysPattern.fromAiJson(everyNDaysPatternJson);
        } else if (json.type === 'every_n_days_pattern') {
            if(AiReturnedNullField(json.initial_date)) {
                log("EveryNDaysPattern.fromAiJson: initial_date is required");
                return NULL;
            }
            
            if(AiReturnedNullField(json.n)) {
                log("EveryNDaysPattern.fromAiJson: n is required");
                return NULL;
            }
            
            let initialDate = DateField.fromYYYY_MM_DDUnsafe(json.initial_date);
            if (initialDate === NULL) {
                log("EveryNDaysPattern.fromAiJson: invalid initial_date format");
                return NULL;
            }
            
            const n = Number(json.n);
            if(!(type(n, Int) && n > 0)) {
                log("EveryNDaysPattern.fromAiJson: n must be a positive integer");
                return NULL;
            }
            
            try {
                return new EveryNDaysPattern(initialDate, n);
            } catch (e) {
                log("EveryNDaysPattern.fromAiJson: error creating instance");
                return NULL;
            }
        } else {
            log("EveryNDaysPattern.fromAiJson: json.type must be 'every_n_days_pattern' or 'weekly_pattern'");
            return NULL;
        }
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

    encode() {
        ASSERT(type(this, HideUntilRelative));
        return {
            value: this.value,
            _type: 'HideUntilRelative'
        };
    }

    static decode(json) {
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

    encode() {
        ASSERT(type(this, HideUntilDate));
        return {
            date: this.date.encode(),
            _type: 'HideUntilDate'
        };
    }

    static decode(json) {
        ASSERT(exists(json));
        return new HideUntilDate(DateField.decode(json.date));
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

    encode() {
        ASSERT(type(this, MonthlyPattern));
        return {
            day: this.day,
            months: this.months,
            _type: 'MonthlyPattern'
        };
    }

    static decode(json) {
        ASSERT(exists(json));
        ASSERT(exists(json.months), "MonthlyPattern.decode: months property is missing.");
        return new MonthlyPattern(json.day, json.months);
    }

    static fromAiJson(json) {
        if(!exists(json)) {
            return NULL;
        }
        
        if(json.type !== 'monthly_pattern') {
            log("MonthlyPattern.fromAiJson: json.type must be 'monthly_pattern'");
            return NULL;
        }
        
        if(AiReturnedNullField(json.day)) {
            log("MonthlyPattern.fromAiJson: day is required");
            return NULL;
        }
        
        let day = Number(json.day);
        if(!type(day, Int)) {
            log("MonthlyPattern.fromAiJson: day must be an integer");
            return NULL;
        }

        if(AiReturnedNullField(json.months)) {
            log("MonthlyPattern.fromAiJson: months array is required");
            return NULL;
        }
        
        const monthsRaw = json.months;
        if(!(Array.isArray(monthsRaw) && monthsRaw.length === 12)) {
            log("MonthlyPattern.fromAiJson: months must be an array of 12 booleans");
            return NULL;
        }
        
        const months = monthsRaw.map(m => !!m);

        try {
            return new MonthlyPattern(day, months);
        } catch (e) {
            log("MonthlyPattern.fromAiJson: error creating instance");
            return NULL;
        }
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

    encode() {
        ASSERT(type(this, AnnuallyPattern));
        return {
            month: this.month,
            day: this.day,
            _type: 'AnnuallyPattern'
        };
    }

    static decode(json) {
        ASSERT(exists(json));
        return new AnnuallyPattern(json.month, json.day);
    }

    static fromAiJson(json) {
        if(!exists(json)) {
            return NULL;
        }
        
        if(json.type !== 'annually_pattern') {
            log("AnnuallyPattern.fromAiJson: json.type must be 'annually_pattern'");
            return NULL;
        }
        
        if(AiReturnedNullField(json.month)) {
            log("AnnuallyPattern.fromAiJson: month is required");
            return NULL;
        }
        
        if(AiReturnedNullField(json.day)) {
            log("AnnuallyPattern.fromAiJson: day is required");
            return NULL;
        }
        
        const month = Number(json.month);
        const day = Number(json.day);
        
        if(!(type(month, Int) && type(day, Int))) {
            log("AnnuallyPattern.fromAiJson: month and day must be integers");
            return NULL;
        }
        
        try {
            return new AnnuallyPattern(month, day);
        } catch (e) {
            log("AnnuallyPattern.fromAiJson: error creating instance");
            return NULL;
        }
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

    encode() {
        ASSERT(type(this, NthWeekdayOfMonthsPattern));
        return {
            dayOfWeek: this.dayOfWeek,
            nthWeekdays: this.nthWeekdays,
            months: this.months,
            _type: 'NthWeekdayOfMonthsPattern'
        };
    }

    static decode(json) {
        ASSERT(exists(json));
        ASSERT(exists(json.nthWeekdays), "NthWeekdayOfMonthsPattern.decode: nthWeekdays property is missing.");
        ASSERT(exists(json.months), "NthWeekdayOfMonthsPattern.decode: months property is missing.");
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
            log("NthWeekdayOfMonthsPattern.fromAiJson: weeks_of_month is not a valid type" + JSON.stringify(weeksSpec));
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
        ASSERT(type(startDate, DateField), "DateRange constructor: startDate must be a DateField: " + JSON.stringify(startDate));
        
        ASSERT(type(endDate, Union(DateField, NULL)), "DateRange constructor: endDate must be a DateField or NULL: " + JSON.stringify(endDate));
            
        // Convert to Date objects for comparison
        if (endDate !== NULL) {
            const endDateObj = endDate.toUnixTimestamp();
            const startDateObj = startDate.toUnixTimestamp();
            ASSERT(endDateObj >= startDateObj);
        }
        
        this.startDate = startDate;
        this.endDate = endDate;
    }

    encode() {
        ASSERT(type(this, DateRange));

        let endDateJson;
        if (this.endDate === NULL) {
            endDateJson = symbolToString(NULL);
        } else {
            endDateJson = this.endDate.encode();
        }

        return {
            startDate: this.startDate.encode(),
            endDate: endDateJson,
            _type: 'DateRange'
        };
    }

    static decode(json) {
        ASSERT(exists(json));
        let endDate;
        if (json.endDate === symbolToString(NULL)) {
            endDate = NULL;
        } else {
            endDate = DateField.decode(json.endDate);
        }
        return new DateRange(DateField.decode(json.startDate), endDate);
    }

    static unsafeConstruct(startDate, endDate) {
        if(!type(startDate, DateField)) {
            return NULL;
        }
        if(!type(endDate, Union(DateField, NULL))) {
            return NULL;
        }

        if(endDate !== NULL) {
            if(endDate.toUnixTimestamp() < startDate.toUnixTimestamp()) {
                return NULL;
            }
        }

        return new DateRange(startDate, endDate);
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

    encode() {
        ASSERT(type(this, RecurrenceCount));
        return {
            initialDate: this.initialDate.encode(),
            count: this.count,
            _type: 'RecurrenceCount'
        };
    }

    static decode(json) {
        ASSERT(exists(json));
        ASSERT(exists(json.initialDate), 'initialDate is required in RecurrenceCount.decode');
        return new RecurrenceCount(DateField.decode(json.initialDate), json.count);
    }
}

// Task instances
class NonRecurringTaskInstance {
    constructor(date, dueTime, completion) {
        ASSERT(type(date, DateField), "NonRecurringTaskInstance constructor: date must be a DateField: " + JSON.stringify(date));
        
        ASSERT(type(dueTime, Union(TimeField, NULL)), "NonRecurringTaskInstance constructor: dueTime must be a TimeField or NULL: " + JSON.stringify(dueTime));
        
        ASSERT(type(completion, Boolean), "NonRecurringTaskInstance constructor: completion must be a boolean: " + completion);
        
        this.date = date;
        this.dueTime = dueTime;
        this.completion = completion;
    }

    getUnixDueDate() {
        ASSERT(type(this, NonRecurringTaskInstance));
        // Include the dueTime if provided so callers get the exact instant the task is due.
        return dueUnixTimestamp(this.date, this.dueTime);
    }

    // no unix args since it only happens once
    isComplete(startUnix, endUnix) {
        ASSERT(type(this, NonRecurringTaskInstance));
        ASSERT(type(startUnix, Union(Int, NULL)));
        ASSERT(type(endUnix, Union(Int, NULL)));

        if (startUnix !== NULL && endUnix !== NULL) {
            const dueTimestamp = dueUnixTimestamp(this.date, this.dueTime);
            if (dueTimestamp < startUnix || dueTimestamp > endUnix) {
                // outside the range, so it's complete in that range
                return true;
            }
        }

        return this.completion;
    }

    encode() {
        ASSERT(type(this, NonRecurringTaskInstance));
        let dueTimeJson;
        if (this.dueTime === NULL) {
            dueTimeJson = symbolToString(NULL);
        } else {
            dueTimeJson = this.dueTime.encode();
        }
        return {
            date: this.date.encode(),
            dueTime: dueTimeJson,
            completion: this.completion,
            _type: 'NonRecurringTaskInstance'
        };
    }

    static decode(json) {
        ASSERT(exists(json));
        let dueTime;
        if (json.dueTime === symbolToString(NULL) || json.dueTime === undefined || json.dueTime === null) {
            dueTime = NULL;
        } else {
            dueTime = TimeField.decode(json.dueTime);
        }
        return new NonRecurringTaskInstance(DateField.decode(json.date), dueTime, json.completion);
    }

    // Parse AI-supplied JSON describing a one-off due-date instance.
    // Expected format:
    //  { "type": "due_date_instance", "date": "YYYY-MM-DD" | null, "time": "HH:MM" | null }
    static fromAiJson(json) {
        if(!exists(json)) {
            return NULL;
        }
        
        if(json.type !== 'due_date_instance') {
            log('NonRecurringTaskInstance.fromAiJson: json.type must be "due_date_instance"');
            return NULL;
        }

        // DATE
        let dateField = NULL;
        if (!AiReturnedNullField(json.date)) {
            if(!type(json.date, NonEmptyString)) {
                log('NonRecurringTaskInstance.fromAiJson: date must be string YYYY-MM-DD');
                return NULL;
            }
            dateField = DateField.fromYYYY_MM_DDUnsafe(json.date);
            if (dateField === NULL) {
                log('NonRecurringTaskInstance.fromAiJson: invalid date format');
                return NULL;
            }
        }

        // TIME
        let dueTime = NULL;
        if (!AiReturnedNullField(json.time)) {
            const t = json.time;
            if(!type(t, NonEmptyString)) {
                log('NonRecurringTaskInstance.fromAiJson: time must be HH:MM string');
                return NULL;
            }
            const parts = t.split(':');
            if(parts.length !== 2) {
                log('NonRecurringTaskInstance.fromAiJson: time must be HH:MM');
                return NULL;
            }
            const hour = Number(parts[0]);
            const minute = Number(parts[1]);
            if(!(type(hour, Int) && type(minute, Int))) {
                log('NonRecurringTaskInstance.fromAiJson: time parts must be integers');
                return NULL;
            }
            dueTime = TimeField.unsafeConstruct(hour, minute);
            if (dueTime === NULL) {
                log('NonRecurringTaskInstance.fromAiJson: invalid time values');
                return NULL;
            }
        }

        // If date missing but time provided -> assume today (UTC)
        if (dateField === NULL && dueTime !== NULL) {
            const now = new Date();
            dateField = DateField.unsafeConstruct(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate());
            if (dateField === NULL) {
                log('NonRecurringTaskInstance.fromAiJson: error creating implicit today date');
                return NULL;
            }
        }

        if(dateField === NULL) {
            log('NonRecurringTaskInstance.fromAiJson: must have either date or time (with implicit today)');
            return NULL;
        }

        try {
            return new NonRecurringTaskInstance(dateField, dueTime === NULL ? NULL : dueTime, false);
        } catch (e) {
            log('NonRecurringTaskInstance.fromAiJson: error creating instance');
            return NULL;
        }
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

    getUnixDueDatesInRange(startUnix, endUnix) {
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

        let dueDates = this.getUnixDueDatesInRange(startUnix, endUnix);

        for (const date of dueDates) {
            if (!this.completion.includes(date)) {
                return false;
            }
        }
        return true;
    }

    encode() {
        ASSERT(type(this, RecurringTaskInstance));
        let dueTimeJson;
        if (this.dueTime === NULL) {
            dueTimeJson = symbolToString(NULL);
        } else {
            dueTimeJson = this.dueTime.encode();
        }
        return {
            datePattern: this.datePattern.encode(),
            dueTime: dueTimeJson,
            range: this.range.encode(),
            completion: this.completion,
            _type: 'RecurringTaskInstance'
        };
    }

    static decode(json) {
        ASSERT(exists(json));
        let dueTime;
        if (json.dueTime === symbolToString(NULL) || json.dueTime === undefined || json.dueTime === null) {
            dueTime = NULL;
        } else {
            dueTime = TimeField.decode(json.dueTime);
        }
        
        let datePattern;
        if (json.datePattern._type === 'EveryNDaysPattern') {
            datePattern = EveryNDaysPattern.decode(json.datePattern);
        } else if (json.datePattern._type === 'MonthlyPattern') {
            datePattern = MonthlyPattern.decode(json.datePattern);
        } else if (json.datePattern._type === 'AnnuallyPattern') {
            datePattern = AnnuallyPattern.decode(json.datePattern);
        } else if (json.datePattern._type === 'NthWeekdayOfMonthsPattern') {
            datePattern = NthWeekdayOfMonthsPattern.decode(json.datePattern);
        } else {
            ASSERT(false, 'Unknown datePattern type in RecurringTaskInstance.decode');
        }

        let range;
        if (json.range._type === 'DateRange') {
            range = DateRange.decode(json.range);
        } else if (json.range._type === 'RecurrenceCount') {
            range = RecurrenceCount.decode(json.range);
        } else {
            ASSERT(false, 'Unknown range type in RecurringTaskInstance.decode');
            throw new Error('Unknown range type in RecurringTaskInstance.decode');
        }

        return new RecurringTaskInstance(datePattern, dueTime, range, json.completion);
    }

    // Parse AI-supplied JSON describing a recurring due-date pattern instance.
    // Expected format:
    //  { "type": "due_date_pattern", "pattern": {...}, "time": "HH:MM" | null, "range": "YYYY-MM-DD:YYYY-MM-DD" | integer }
    static fromAiJson(json) {
        if(!exists(json)) {
            return NULL;
        }
        
        if(json.type !== 'due_date_pattern') {
            log('RecurringTaskInstance.fromAiJson: json.type must be "due_date_pattern"');
            return NULL;
        }

        // --- PATTERN ---
        if(!exists(json.pattern)) {
            log('RecurringTaskInstance.fromAiJson: pattern is required');
            return NULL;
        }
        
        const pt = json.pattern;
        if(!type(pt.type, NonEmptyString)) {
            log('RecurringTaskInstance.fromAiJson: pattern.type missing');
            return NULL;
        }
        
        let datePattern;
        if (pt.type === 'every_n_days_pattern') {
            datePattern = EveryNDaysPattern.fromAiJson(pt);
        } else if (pt.type === 'weekly_pattern') {
            datePattern = WeeklyPattern.fromAiJson(pt, json.range);
        } else if (pt.type === 'monthly_pattern') {
            datePattern = MonthlyPattern.fromAiJson(pt);
        } else if (pt.type === 'annually_pattern') {
            datePattern = AnnuallyPattern.fromAiJson(pt);
        } else if (pt.type === 'nth_weekday_of_months_pattern') {
            datePattern = NthWeekdayOfMonthsPattern.fromAiJson(pt);
        } else {
            log('RecurringTaskInstance.fromAiJson: unknown pattern.type ' + String(pt.type));
            return NULL;
        }
        
        // Check if pattern creation failed
        if(datePattern === NULL) {
            log('RecurringTaskInstance.fromAiJson: failed to create date pattern');
            return NULL;
        }

        // --- TIME ---
        let dueTime = NULL;
        if (!AiReturnedNullField(json.time)) {
            const t = json.time;
            if(!type(t, NonEmptyString)) {
                log('RecurringTaskInstance.fromAiJson: time must be HH:MM string');
                return NULL;
            }
            const parts = t.split(':');
            if(parts.length !== 2) {
                log('RecurringTaskInstance.fromAiJson: time must be HH:MM');
                return NULL;
            }
            const hour = Number(parts[0]);
            const minute = Number(parts[1]);
            if(!(type(hour, Int) && type(minute, Int))) {
                log('RecurringTaskInstance.fromAiJson: time parts must be integers');
                return NULL;
            }
            dueTime = TimeField.unsafeConstruct(hour, minute);
            if (dueTime === NULL) {
                log('RecurringTaskInstance.fromAiJson: invalid time values');
                return NULL;
            }
        }

        // --- RANGE ---
        if(AiReturnedNullField(json.range)) {
            log('RecurringTaskInstance.fromAiJson: range is required');
            return NULL;
        }
        
        let range;
        if (typeof json.range === 'string') {
            const parts = json.range.split(':');
            if(parts.length !== 2) {
                log('RecurringTaskInstance.fromAiJson: range string must be "start:end"');
                return NULL;
            }
            
            const startDate = DateField.fromYYYY_MM_DDUnsafe(parts[0]);
            if (startDate === NULL) {
                log('RecurringTaskInstance.fromAiJson: invalid range start date format');
                return NULL;
            }
            
            let endDate;
            if (AiReturnedNullField(parts[1]) || parts[1] === '') {
                endDate = NULL;
            } else {
                endDate = DateField.fromYYYY_MM_DDUnsafe(parts[1]);
                if (endDate === NULL) {
                    log('RecurringTaskInstance.fromAiJson: invalid range end date format');
                    return NULL;
                }
            }
            
            range = DateRange.unsafeConstruct(startDate, endDate);
            if (range === NULL) {
                log('RecurringTaskInstance.fromAiJson: error creating date range');
                return NULL;
            }
        } else {
            const count = Number(json.range);
            if(!(type(count, Int) && count > 0)) {
                log('RecurringTaskInstance.fromAiJson: numeric range must be positive integer');
                return NULL;
            }
            
            // Only allow numeric recurrence for patterns that contain an initial date
            if(pt.type !== 'every_n_days_pattern') {
                log('RecurringTaskInstance.fromAiJson: numeric range only allowed with every_n_days_pattern');
                return NULL;
            }
            
            try {
                range = new RecurrenceCount(datePattern.initialDate, count);
            } catch (e) {
                log('RecurringTaskInstance.fromAiJson: error creating recurrence count');
                return NULL;
            }
        }

        try {
            return new RecurringTaskInstance(datePattern, dueTime, range, []);
        } catch (e) {
            log('RecurringTaskInstance.fromAiJson: error creating instance');
            return NULL;
        }
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

    encode() {
        ASSERT(type(this, NonRecurringEventInstance));
        let startTimeJson;
        if (this.startTime === NULL) {
            startTimeJson = symbolToString(NULL);
        } else {
            startTimeJson = this.startTime.encode();
        }
        let endTimeJson;
        if (this.endTime === NULL) {
            endTimeJson = symbolToString(NULL);
        } else {
            endTimeJson = this.endTime.encode();
        }
        let differentEndDateJson;
        if (this.differentEndDate === NULL) {
            differentEndDateJson = symbolToString(NULL);
        } else {
            differentEndDateJson = this.differentEndDate.encode();
        }
        return {
            startDate: this.startDate.encode(),
            startTime: startTimeJson,
            endTime: endTimeJson,
            differentEndDate: differentEndDateJson,
            _type: 'NonRecurringEventInstance'
        };
    }

    static decode(json) {
        ASSERT(exists(json));
        let startTime;
        if (json.startTime === symbolToString(NULL) || json.startTime === undefined || json.startTime === null) {
            startTime = NULL;
        } else {
            startTime = TimeField.decode(json.startTime);
        }

        let endTime;
        if (json.endTime === symbolToString(NULL) || json.endTime === undefined || json.endTime === null) {
            endTime = NULL;
        } else {
            endTime = TimeField.decode(json.endTime);
        }

        let differentEndDate;
        if (json.differentEndDate === symbolToString(NULL) || json.differentEndDate === undefined || json.differentEndDate === null) {
            differentEndDate = NULL;
        } else {
            differentEndDate = DateField.decode(json.differentEndDate);
        }
        return new NonRecurringEventInstance(DateField.decode(json.startDate), startTime, endTime, differentEndDate);
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
        if(!exists(json)) {
            return NULL;
        }
        
        if(json.type !== 'event_instance') {
            log('NonRecurringEventInstance.fromAiJson: json.type must be "event_instance"');
            return NULL;
        }

        // start_date (required)
        if(AiReturnedNullField(json.start_date)) {
            log('NonRecurringEventInstance.fromAiJson: start_date is required');
            return NULL;
        }
        
        const startDate = DateField.fromYYYY_MM_DDUnsafe(json.start_date);
        if (startDate === NULL) {
            log('NonRecurringEventInstance.fromAiJson: invalid start_date format');
            return NULL;
        }

        // start_time (optional)
        let startTime = NULL;
        if (!AiReturnedNullField(json.start_time)) {
            const stParts = json.start_time.split(':');
            if(stParts.length !== 2) {
                log('NonRecurringEventInstance.fromAiJson: start_time must be HH:MM');
                return NULL;
            }
            const stHour = Number(stParts[0]);
            const stMinute = Number(stParts[1]);
            if(!(type(stHour, Int) && type(stMinute, Int))) {
                log('NonRecurringEventInstance.fromAiJson: start_time parts must be integers');
                return NULL;
            }
            startTime = TimeField.unsafeConstruct(stHour, stMinute);
            if (startTime === NULL) {
                log('NonRecurringEventInstance.fromAiJson: invalid start_time values');
                return NULL;
            }
        }

        // end_time (optional)
        let endTime = NULL;
        if (!AiReturnedNullField(json.end_time)) {
            const etParts = json.end_time.split(':');
            if(etParts.length !== 2) {
                log('NonRecurringEventInstance.fromAiJson: end_time must be HH:MM');
                return NULL;
            }
            const etHour = Number(etParts[0]);
            const etMinute = Number(etParts[1]);
            if(!(type(etHour, Int) && type(etMinute, Int))) {
                log('NonRecurringEventInstance.fromAiJson: end_time parts must be integers');
                return NULL;
            }
            endTime = TimeField.unsafeConstruct(etHour, etMinute);
            if (endTime === NULL) {
                log('NonRecurringEventInstance.fromAiJson: invalid end_time values');
                return NULL;
            }
        }

        // different_end_date (optional)
        let differentEndDate = NULL;
        if (!AiReturnedNullField(json.different_end_date)) {
            differentEndDate = DateField.fromYYYY_MM_DDUnsafe(json.different_end_date);
            if (differentEndDate === NULL) {
                log('NonRecurringEventInstance.fromAiJson: invalid different_end_date format');
                return NULL;
            }
        }

        // Validation: if startTime is NULL, endTime must also be NULL. If endTime is NULL, differentEndDate must be NULL.
        if (startTime === NULL) {
            if(endTime !== NULL) {
                log('NonRecurringEventInstance.fromAiJson: end_time must be NULL if start_time is NULL');
                return NULL;
            }
        }
        if (endTime === NULL) {
            if(differentEndDate !== NULL) {
                log('NonRecurringEventInstance.fromAiJson: different_end_date must be NULL if end_time is NULL');
                return NULL;
            }
        }

        try {
            return new NonRecurringEventInstance(startDate, startTime, endTime, differentEndDate);
        } catch (e) {
            log('NonRecurringEventInstance.fromAiJson: error creating instance');
            return NULL;
        }
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

    encode() {
        ASSERT(type(this, RecurringEventInstance));
        let startTimeJson;
        if (this.startTime === NULL) {
            startTimeJson = symbolToString(NULL);
        } else {
            startTimeJson = this.startTime.encode();
        }
        let endTimeJson;
        if (this.endTime === NULL) {
            endTimeJson = symbolToString(NULL);
        } else {
            endTimeJson = this.endTime.encode();
        }
        let differentEndDatePatternJson;
        if (this.differentEndDatePattern === NULL) {
            differentEndDatePatternJson = symbolToString(NULL);
        } else {
            differentEndDatePatternJson = this.differentEndDatePattern;
        }

        return {
            startDatePattern: this.startDatePattern.encode(),
            startTime: startTimeJson,
            endTime: endTimeJson,
            range: this.range.encode(),
            differentEndDatePattern: differentEndDatePatternJson,
            _type: 'RecurringEventInstance'
        };
    }

    static decode(json) {
        ASSERT(exists(json));
        let startDatePattern;
        if (json.startDatePattern._type === 'EveryNDaysPattern') {
            startDatePattern = EveryNDaysPattern.decode(json.startDatePattern);
        } else if (json.startDatePattern._type === 'MonthlyPattern') {
            startDatePattern = MonthlyPattern.decode(json.startDatePattern);
        } else if (json.startDatePattern._type === 'AnnuallyPattern') {
            startDatePattern = AnnuallyPattern.decode(json.startDatePattern);
        } else if (json.startDatePattern._type === 'NthWeekdayOfMonthsPattern') {
            startDatePattern = NthWeekdayOfMonthsPattern.decode(json.startDatePattern);
        } else {
            ASSERT(false, 'Unknown startDatePattern type in RecurringEventInstance.decode');
        }

        ASSERT(exists(json.startTime), 'startTime is required in RecurringEventInstance.decode');
        ASSERT(exists(json.endTime), 'endTime is required in RecurringEventInstance.decode');
        ASSERT(exists(json.range), 'range is required in RecurringEventInstance.decode');

        let startTime;
        if (json.startTime === symbolToString(NULL)) {
            startTime = NULL;
        } else {
            startTime = TimeField.decode(json.startTime);
        }

        let endTime;
        if (json.endTime === symbolToString(NULL)) {
            endTime = NULL;
        } else {
            endTime = TimeField.decode(json.endTime);
        }

        let range;
        if (json.range._type === 'DateRange') {
            range = DateRange.decode(json.range);
        } else if (json.range._type === 'RecurrenceCount') {
            range = RecurrenceCount.decode(json.range);
        } else {
            ASSERT(false, 'Unknown range type in RecurringEventInstance.decode');
        }
        
        // differentEndDatePattern can be NULL
        let differentEndDatePattern;
        if (json.differentEndDatePattern === symbolToString(NULL)) {
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
        if(!exists(json)) {
            return NULL;
        }
        
        if(json.type !== 'event_pattern') {
            log('RecurringEventInstance.fromAiJson: json.type must be "event_pattern"');
            return NULL;
        }

        if(!exists(json.start_date_pattern)) {
            log('RecurringEventInstance.fromAiJson: start_date_pattern required');
            return NULL;
        }
        
        const p = json.start_date_pattern;
        let startDatePattern;
        if (p.type === 'every_n_days_pattern') {
            startDatePattern = EveryNDaysPattern.fromAiJson(p);
        } else if (p.type === 'weekly_pattern') {
            startDatePattern = WeeklyPattern.fromAiJson(p, json.range);
        } else if (p.type === 'monthly_pattern') {
            startDatePattern = MonthlyPattern.fromAiJson(p);
        } else if (p.type === 'annually_pattern') {
            startDatePattern = AnnuallyPattern.fromAiJson(p);
        } else if (p.type === 'nth_weekday_of_months_pattern') {
            startDatePattern = NthWeekdayOfMonthsPattern.fromAiJson(p);
        } else {
            log('RecurringEventInstance.fromAiJson: unknown start_date_pattern.type ' + String(p.type));
            return NULL;
        }
        
        // Check if pattern creation failed
        if(startDatePattern === NULL) {
            log('RecurringEventInstance.fromAiJson: failed to create start date pattern');
            return NULL;
        }

        let startTime = NULL;
        if (!AiReturnedNullField(json.start_time)) {
            const parts = json.start_time.split(':');
            if(parts.length !== 2) {
                log('RecurringEventInstance.fromAiJson: start_time must be HH:MM');
                return NULL;
            }
            
            const hour = Number(parts[0]);
            const minute = Number(parts[1]);
            if(!(type(hour, Int) && type(minute, Int))) {
                log('RecurringEventInstance.fromAiJson: start_time parts must be integers');
                return NULL;
            }
            
            startTime = TimeField.unsafeConstruct(hour, minute);
            if (startTime === NULL) {
                log('RecurringEventInstance.fromAiJson: invalid start_time values');
                return NULL;
            }
        }

        let endTime = NULL;
        if (!AiReturnedNullField(json.end_time)) {
            const parts = json.end_time.split(':');
            if(parts.length !== 2) {
                log('RecurringEventInstance.fromAiJson: end_time must be HH:MM');
                return NULL;
            }
            
            const hour = Number(parts[0]);
            const minute = Number(parts[1]);
            if(!(type(hour, Int) && type(minute, Int))) {
                log('RecurringEventInstance.fromAiJson: end_time parts must be integers');
                return NULL;
            }
            
            endTime = TimeField.unsafeConstruct(hour, minute);
            if (endTime === NULL) {
                log('RecurringEventInstance.fromAiJson: invalid end_time values');
                return NULL;
            }
        }

        // --- different_end_date_offset ---
        let differentEndDatePattern = NULL;
        if (!AiReturnedNullField(json.different_end_date_offset)) {
            const off = Number(json.different_end_date_offset);
            if(!(type(off, Int) && off > 0)) {
                log('RecurringEventInstance.fromAiJson: different_end_date_offset must be positive int');
                return NULL;
            }
            differentEndDatePattern = off;
        }

        // Validation: if startTime is NULL, endTime must also be NULL. If endTime is NULL, differentEndDatePattern must be NULL.
        if (startTime === NULL) {
            if(endTime !== NULL) {
                log('RecurringEventInstance.fromAiJson: end_time must be NULL if start_time is NULL');
                return NULL;
            }
        }
        if (endTime === NULL) {
            if(differentEndDatePattern !== NULL) {
                log('RecurringEventInstance.fromAiJson: different_end_date_offset must be NULL if end_time is NULL');
                return NULL;
            }
        }

        // --- RANGE ---
        if(AiReturnedNullField(json.range)) {
            log('RecurringEventInstance.fromAiJson: range is required');
            return NULL;
        }
        
        let range;
        if (typeof json.range === 'string') {
            const parts = json.range.split(':');
            if(parts.length !== 2) {
                log('RecurringEventInstance.fromAiJson: range string must be "start:end"');
                return NULL;
            }
            
            const startDate = DateField.fromYYYY_MM_DDUnsafe(parts[0]);
            if (startDate === NULL) {
                log('RecurringEventInstance.fromAiJson: invalid range start date format');
                return NULL;
            }
            
            let endDate;
            if (AiReturnedNullField(parts[1]) || parts[1] === '') {
                endDate = NULL;
            } else {
                endDate = DateField.fromYYYY_MM_DDUnsafe(parts[1]);
                if (endDate === NULL) {
                    log('RecurringEventInstance.fromAiJson: invalid range end date format');
                    return NULL;
                }
            }
            
            range = DateRange.unsafeConstruct(startDate, endDate);
            if (range === NULL) {
                log('RecurringEventInstance.fromAiJson: error creating date range');
                return NULL;
            }
        } else {
            const count = Number(json.range);
            if(!(type(count, Int) && count > 0)) {
                log('RecurringEventInstance.fromAiJson: numeric range must be positive integer');
                return NULL;
            }
            
            // Only allow numeric recurrence for patterns that contain an initial date
            if(p.type !== 'every_n_days_pattern') {
                log('RecurringEventInstance.fromAiJson: numeric range only allowed with every_n_days_pattern');
                return NULL;
            }
            
            try {
                range = new RecurrenceCount(startDatePattern.initialDate, count);
            } catch (e) {
                log('RecurringEventInstance.fromAiJson: error creating recurrence count');
                return NULL;
            }
        }

        try {
            ASSERT(exists(startDatePattern), 'startDatePattern is required in RecurringEventInstance.fromAiJson');
            ASSERT(exists(startTime), 'startTime is required in RecurringEventInstance.fromAiJson');
            ASSERT(exists(endTime), 'endTime is required in RecurringEventInstance.fromAiJson');
            ASSERT(exists(range), 'range is required in RecurringEventInstance.fromAiJson');
            ASSERT(exists(differentEndDatePattern), 'differentEndDatePattern is required in RecurringEventInstance.fromAiJson');
            return new RecurringEventInstance(startDatePattern, startTime, endTime, range, differentEndDatePattern);
        } catch (e) {
            log('RecurringEventInstance.fromAiJson: error creating instance');
            return NULL;
        }
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
                let dueTimestamp = instance.getUnixDueDate();
                if (dueTimestamp >= startUnix && dueTimestamp <= endUnix) {
                    dueDates.push([{date : dueTimestamp, completed : instance.completion}]);
                }
            } else if (type(instance, RecurringTaskInstance)) {
                let arr = [];
                for (const dateMidnight of instance.getUnixDueDatesInRange(startUnix, endUnix)) {
                    const dueTimestamp = dateMidnight + (instance.dueTime === NULL ? MS_PER_DAY - 1 : ((instance.dueTime.hour * 60 + instance.dueTime.minute) * 60 * 1000));
                    arr.push({date : dueTimestamp, completed : instance.completion.includes(dateMidnight)});
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

    encode() {
        ASSERT(type(this, TaskData));
        let instancesJson = [];
        for (const instance of this.instances) {
            instancesJson.push(instance.encode());
        }
        let hideUntilJson;
        if (this.hideUntil === NULL) {
            hideUntilJson = symbolToString(NULL);
        } else if (this.hideUntil === HideUntilDayOf) {
            hideUntilJson = symbolToString(HideUntilDayOf);
        } else {
            hideUntilJson = this.hideUntil.encode();
        }
        let workSessionsJson = [];
        for (const session of this.workSessions) {
            workSessionsJson.push(session.encode());
        }
        return {
            instances: instancesJson,
            hideUntil: hideUntilJson,
            showOverdue: this.showOverdue,
            workSessions: workSessionsJson,
            _type: 'TaskData'
        };
    }

    static decode(json) {
        ASSERT(exists(json));
        let instances = [];
        for (const instanceJson of json.instances) {
            if (instanceJson._type === 'NonRecurringTaskInstance') {
                instances.push(NonRecurringTaskInstance.decode(instanceJson));
            } else if (instanceJson._type === 'RecurringTaskInstance') {
                instances.push(RecurringTaskInstance.decode(instanceJson));
            } else {
                ASSERT(false, 'Unknown instance type in TaskData.decode');
            }
        }
        let hideUntil;
        if (json.hideUntil === symbolToString(NULL)) {
            hideUntil = NULL;
        } else if (json.hideUntil === symbolToString(HideUntilDayOf)) {
            hideUntil = HideUntilDayOf;
        } else if (json.hideUntil._type === 'HideUntilRelative') {
            hideUntil = HideUntilRelative.decode(json.hideUntil);
        } else if (json.hideUntil._type === 'HideUntilDate') {
            hideUntil = HideUntilDate.decode(json.hideUntil);
        } else {
            ASSERT(false, 'Unknown hideUntil type in TaskData.decode');
        }
        let workSessions = [];
        ASSERT(Array.isArray(json.workSessions));
        for (const sessionJson of json.workSessions) {
            ASSERT(exists(sessionJson));
            if (sessionJson._type === 'NonRecurringEventInstance') {
                workSessions.push(NonRecurringEventInstance.decode(sessionJson));
            } else if (sessionJson._type === 'RecurringEventInstance') {
                workSessions.push(RecurringEventInstance.decode(sessionJson));
            } else {
                ASSERT(false, 'Unknown workSession type in TaskData.decode');
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
    setPastDueDatesToComplete(excludeWithinDays = 0) {
        ASSERT(type(this, TaskData));
        const now = Date.now();
        // Unix start of today in local timezone
        const todayStart = DateTime.local().startOf('day').toMillis();
        // Anything with dueTimestamp >= cutoff will be left incomplete
        const cutoff = todayStart - (excludeWithinDays * MS_PER_DAY);
        
        for (const instance of this.instances) {
            if (type(instance, NonRecurringTaskInstance)) {
                const dueTimestamp = dueUnixTimestamp(instance.date, instance.dueTime);
                if (dueTimestamp < now && dueTimestamp < cutoff) {
                    instance.completion = true;
                }
            } else if (type(instance, RecurringTaskInstance)) {
                // Retrieve due dates up to today and evaluate their exact due moments.
                const candidateDates = instance.getUnixDueDatesInRange(0, now);

                for (const dateMidnight of candidateDates) {
                    const dueTimestamp = dateMidnight + (instance.dueTime === NULL
                        ? MS_PER_DAY - 1
                        : ((instance.dueTime.hour * 60 + instance.dueTime.minute) * 60 * 1000));

                    if (dueTimestamp < now && dueTimestamp < cutoff && !instance.completion.includes(dateMidnight)) {
                        instance.completion.push(dateMidnight);
                    }
                }
            }
        }
    }

    static fromAiJson(json, markPastDueComplete = true, excludeWithinDays = 0) {
        if(!exists(json)) {
            return NULL;
        }

        if(json.type !== 'task') {
            log('TaskData.fromAiJson: json.type must be "task"');
            return NULL;
        }

        if(!Array.isArray(json.instances) || json.instances.length === 0) {
            log('TaskData.fromAiJson: instances array required');
            return NULL;
        }
        const instances = [];
        for (const inst of json.instances) {
            if(!exists(inst) || !type(inst.type, NonEmptyString)) {
                log('TaskData.fromAiJson: each instance needs a type');
                return NULL;
            }
            let converted = NULL;
            if (inst.type === 'due_date_instance') {
                converted = NonRecurringTaskInstance.fromAiJson(inst);
            } else if (inst.type === 'due_date_pattern') {
                converted = RecurringTaskInstance.fromAiJson(inst);
            } else {
                log('TaskData.fromAiJson: unknown instance type ' + String(inst.type));
                return NULL;
            }
            if(converted === NULL) {
                log('TaskData.fromAiJson: failed converting instance');
                return NULL;
            }
            instances.push(converted);
        }

        let workSessions = [];
        if (!AiReturnedNullField(json.work_sessions)) {
            if(!Array.isArray(json.work_sessions)) {
                log('TaskData.fromAiJson: work_sessions must be array');
                return NULL;
            }
            for (const ws of json.work_sessions) {
                if(!exists(ws) || !type(ws.type, NonEmptyString)) {
                    log('TaskData.fromAiJson: each work_session needs a type');
                    return NULL;
                }
                let sess = NULL;
                if (ws.type === 'event_instance') {
                    sess = NonRecurringEventInstance.fromAiJson(ws);
                } else if (ws.type === 'event_pattern') {
                    sess = RecurringEventInstance.fromAiJson(ws);
                } else {
                    log('TaskData.fromAiJson: unknown work_session type ' + String(ws.type));
                    return NULL;
                }
                if(sess === NULL) {
                    log('TaskData.fromAiJson: failed converting work_session');
                    return NULL;
                }
                workSessions.push(sess);
            }
        }

        try {
            const taskData = new TaskData(instances, NULL, true, workSessions);
            // Optionally mark past-due items complete
            if (markPastDueComplete) {
                taskData.setPastDueDatesToComplete(excludeWithinDays);
            }
            return taskData;
        } catch (e) {
            log('TaskData.fromAiJson: error creating TaskData: ' + e.message + ' ' + e.stack);
            return NULL;
        }
    }
}

class EventData {
    constructor(instances) {
        ASSERT(type(instances, List(Union(NonRecurringEventInstance, RecurringEventInstance))));
        
        this.instances = instances;
    }

    encode() {
        ASSERT(type(this, EventData));
        let instancesJson = [];
        for (const instance of this.instances) {
            instancesJson.push(instance.encode());
        }
        return {
            instances: instancesJson,
            _type: 'EventData'
        };
    }

    static decode(json) {
        ASSERT(exists(json));
        let instances = [];
        for (const instanceJson of json.instances) {
            if (instanceJson._type === 'NonRecurringEventInstance') {
                instances.push(NonRecurringEventInstance.decode(instanceJson));
            } else if (instanceJson._type === 'RecurringEventInstance') {
                instances.push(RecurringEventInstance.decode(instanceJson));
            } else {
                ASSERT(false, 'Unknown instance type in EventData.decode');
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
        if(!exists(json)) {
            return NULL;
        }
        
        if(json.type !== 'event') {
            log('EventData.fromAiJson: json.type must be "event"');
            return NULL;
        }

        if(!Array.isArray(json.instances) || json.instances.length === 0) {
            log('EventData.fromAiJson: instances array required');
            return NULL;
        }
        const instances = [];
        for (const inst of json.instances) {
            if(!exists(inst) || !type(inst.type, NonEmptyString)) {
                log('EventData.fromAiJson: each instance needs a type');
                return NULL;
            }
            let conv = NULL;
            if (inst.type === 'event_instance') {
                conv = NonRecurringEventInstance.fromAiJson(inst);
            } else if (inst.type === 'event_pattern') {
                conv = RecurringEventInstance.fromAiJson(inst);
            } else {
                log('EventData.fromAiJson: unknown instance type ' + String(inst.type));
                return NULL;
            }
            if(conv === NULL) {
                log('EventData.fromAiJson: failed converting instance');
                return NULL;
            }
            instances.push(conv);
        }

        try {
            return new EventData(instances);
        } catch (e) {
            log('EventData.fromAiJson: error creating EventData');
            return NULL;
        }
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

    encode() {
        ASSERT(type(this, NonRecurringReminderInstance));
        return {
            date: this.date.encode(),
            time: this.time.encode(),
            _type: 'NonRecurringReminderInstance'
        };
    }

    static decode(json) {
        ASSERT(exists(json));
        return new NonRecurringReminderInstance(DateField.decode(json.date), TimeField.decode(json.time));
    }

    // AI JSON: { "type":"reminder_instance", "date":"YYYY-MM-DD", "time":"HH:MM" }
    static fromAiJson(json) {
        if(!exists(json)) {
            return NULL;
        }
        
        if(json.type !== 'reminder_instance') {
            log("NonRecurringReminderInstance.fromAiJson: json.type must be 'reminder_instance'");
            return NULL;
        }
        
        if(AiReturnedNullField(json.date)) {
            log("NonRecurringReminderInstance.fromAiJson: date is required");
            return NULL;
        }
        
        if(AiReturnedNullField(json.time)) {
            log("NonRecurringReminderInstance.fromAiJson: time is required");
            return NULL;
        }
        
        const date = DateField.fromYYYY_MM_DDUnsafe(json.date);
        if (date === NULL) {
            log("NonRecurringReminderInstance.fromAiJson: invalid date format");
            return NULL;
        }
        
        const parts = json.time.split(':');
        if(parts.length !== 2) {
            log("NonRecurringReminderInstance.fromAiJson: time must be HH:MM");
            return NULL;
        }
        
        const hour = Number(parts[0]);
        const minute = Number(parts[1]);
        if(!type(hour, Int) || !type(minute, Int)) {
            log("NonRecurringReminderInstance.fromAiJson: time parts must be integers");
            return NULL;
        }
        
        let time = TimeField.unsafeConstruct(hour, minute);
        if (time === NULL) {
            log("NonRecurringReminderInstance.fromAiJson: invalid time values");
            return NULL;
        }
        
        try {
            return new NonRecurringReminderInstance(date, time);
        } catch (e) {
            log("NonRecurringReminderInstance.fromAiJson: error creating instance");
            return NULL;
        }
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

    encode() {
        ASSERT(type(this, RecurringReminderInstance));
        return {
            datePattern: this.datePattern.encode(),
            time: this.time.encode(),
            range: this.range.encode(),
            _type: 'RecurringReminderInstance'
        };
    }

    static decode(json) {
        ASSERT(exists(json) && exists(json.datePattern));
        let datePattern;
        if (json.datePattern._type === 'EveryNDaysPattern') {
            datePattern = EveryNDaysPattern.decode(json.datePattern);
        } else if (json.datePattern._type === 'MonthlyPattern') {
            datePattern = MonthlyPattern.decode(json.datePattern);
        } else if (json.datePattern._type === 'AnnuallyPattern') {
            datePattern = AnnuallyPattern.decode(json.datePattern);
        } else if (json.datePattern._type === 'NthWeekdayOfMonthsPattern') {
            datePattern = NthWeekdayOfMonthsPattern.decode(json.datePattern);
        } else {
            ASSERT(false, 'Unknown datePattern type in RecurringReminderInstance.decode');
        }

        let time = TimeField.decode(json.time);

        let range;
        if (json.range._type === 'DateRange') {
            range = DateRange.decode(json.range);
        } else if (json.range._type === 'RecurrenceCount') {
            range = RecurrenceCount.decode(json.range);
        } else {
            ASSERT(false, 'Unknown range type in RecurringReminderInstance.decode');
        }

        return new RecurringReminderInstance(datePattern, time, range);
    }

    // AI JSON: {
    //   "type": "reminder_pattern",
    //   "date_pattern": every_n_days_pattern, monthly_pattern, annually_pattern, or nth_weekday_of_months_pattern
    //   "time": "HH:MM",
    //   "range": "YYYY-MM-DD:YYYY-MM-DD" | int
    // }
    static fromAiJson(json) {
        if(!exists(json)) {
            return NULL;
        }
        
        if(json.type !== 'reminder_pattern') {
            log('RecurringReminderInstance.fromAiJson: json.type must be "reminder_pattern"');
            return NULL;
        }

        // the ai may have mistakenly used "date" instead of "date_pattern"
        if (exists(json.date)) {
            json.date_pattern = json.date;
        }

        if(!exists(json.date_pattern)) {
            log('RecurringReminderInstance.fromAiJson: date_pattern required');
            return NULL;
        }

        let datePattern;
        if (json.date_pattern.type === 'every_n_days_pattern') {
            datePattern = EveryNDaysPattern.fromAiJson(json.date_pattern);
        } else if (json.date_pattern.type === 'weekly_pattern') {
            datePattern = WeeklyPattern.fromAiJson(json.date_pattern, json.range);
        } else if (json.date_pattern.type === 'monthly_pattern') {
            datePattern = MonthlyPattern.fromAiJson(json.date_pattern);
        } else if (json.date_pattern.type === 'annually_pattern') {
            datePattern = AnnuallyPattern.fromAiJson(json.date_pattern);
        } else if (json.date_pattern.type === 'nth_weekday_of_months_pattern') {
            datePattern = NthWeekdayOfMonthsPattern.fromAiJson(json.date_pattern);
        } else {
            log('RecurringReminderInstance.fromAiJson: unknown date_pattern.type ' + String(json.date_pattern.type));
            return NULL;
        }

        if(datePattern === NULL) {
            log('RecurringReminderInstance.fromAiJson: datePattern conversion failed');
            return NULL;
        }

        // time mandatory
        if(AiReturnedNullField(json.time)) {
            log('RecurringReminderInstance.fromAiJson: time required');
            return NULL;
        }
        const parts = json.time.split(':');
        if(parts.length !== 2) {
            log('RecurringReminderInstance.fromAiJson: time must be HH:MM');
            return NULL;
        }
        const hour = Number(parts[0]);
        const minute = Number(parts[1]);
        if(!(type(hour, Int) && type(minute, Int))) {
            log('RecurringReminderInstance.fromAiJson: time parts must be integers');
            return NULL;
        }
        let time = TimeField.unsafeConstruct(hour, minute);
        if (time === NULL) {
            log('RecurringReminderInstance.fromAiJson: invalid time values');
            return NULL;
        }

        // range mandatory
        if(AiReturnedNullField(json.range)) {
            log('RecurringReminderInstance.fromAiJson: range required');
            return NULL;
        }
        let range;
        if (type(json.range, String)) {
            const rparts = json.range.split(':');
            if(rparts.length !== 2) {
                log('RecurringReminderInstance.fromAiJson: range string must be "start:end"');
                return NULL;
            }
            const startDate = DateField.fromYYYY_MM_DDUnsafe(rparts[0]);
            if (startDate === NULL) {
                log('RecurringReminderInstance.fromAiJson: invalid range start date');
                return NULL;
            }
            let endDate;
            if (AiReturnedNullField(rparts[1]) || rparts[1] === '') {
                endDate = NULL;
            } else {
                endDate = DateField.fromYYYY_MM_DDUnsafe(rparts[1]);
                if (endDate === NULL) {
                    log('RecurringReminderInstance.fromAiJson: invalid range end date');
                    return NULL;
                }
            }
            range = DateRange.unsafeConstruct(startDate, endDate);
            if (range === NULL) {
                log('RecurringReminderInstance.fromAiJson: error creating DateRange');
                return NULL;
            }
        } else {
            const count = Number(json.range);
            if(!(type(count, Int) && count > 0)) {
                log('RecurringReminderInstance.fromAiJson: numeric range must positive int');
                return NULL;
            }
            if(json.date_pattern.type !== 'every_n_days_pattern') {
                log('RecurringReminderInstance.fromAiJson: numeric range only allowed with every_n_days_pattern');
                return NULL;
            }
            try {
                range = new RecurrenceCount(datePattern.initialDate, count);
            } catch (e) {
                log('RecurringReminderInstance.fromAiJson: error creating RecurrenceCount');
                return NULL;
            }
        }

        try {
            return new RecurringReminderInstance(datePattern, time, range);
        } catch (e) {
            log('RecurringReminderInstance.fromAiJson: error creating instance');
            return NULL;
        }
    }
}

class ReminderData {
    constructor(instances) {
        ASSERT(type(instances, List(Union(NonRecurringReminderInstance, RecurringReminderInstance))));
        this.instances = instances;
    }

    encode() {
        ASSERT(type(this, ReminderData));
        let instancesJson = [];
        for (const instance of this.instances) {
            instancesJson.push(instance.encode());
        }
        return {
            instances: instancesJson,
            _type: 'ReminderData'
        };
    }

    static decode(json) {
        ASSERT(exists(json));
        let instances = [];
        for (const instanceJson of json.instances) {
            if (instanceJson._type === 'NonRecurringReminderInstance') {
                instances.push(NonRecurringReminderInstance.decode(instanceJson));
            } else if (instanceJson._type === 'RecurringReminderInstance') {
                instances.push(RecurringReminderInstance.decode(instanceJson));
            } else {
                ASSERT(false, 'Unknown instance type in ReminderData.decode');
            }
        }
        return new ReminderData(instances);
    }

    // AI JSON schema: { "type":"reminder", "instances": [ ... ] }
    static fromAiJson(json) {
        if(!exists(json)) {
            return NULL;
        }
        
        if(json.type !== 'reminder') {
            log('ReminderData.fromAiJson: json.type must be "reminder"');
            return NULL;
        }

        if(!Array.isArray(json.instances) || json.instances.length === 0) {
            log('ReminderData.fromAiJson: instances array required');
            return NULL;
        }
        const instances = [];
        for (const inst of json.instances) {
            if(!exists(inst) || !type(inst.type, NonEmptyString)) {
                log('ReminderData.fromAiJson: each instance needs a type');
                return NULL;
            }
            let conv = NULL;
            if (inst.type === 'reminder_instance') {
                conv = NonRecurringReminderInstance.fromAiJson(inst);
            } else if (inst.type === 'reminder_pattern') {
                conv = RecurringReminderInstance.fromAiJson(inst);
            } else {
                log('ReminderData.fromAiJson: unknown instance type ' + String(inst.type));
                return NULL;
            }
            if(conv === NULL) {
                log('ReminderData.fromAiJson: failed converting instance');
                return NULL;
            }
            instances.push(conv);
        }

        try {
            return new ReminderData(instances);
        } catch (e) {
            log('ReminderData.fromAiJson: error creating ReminderData');
            return NULL;
        }
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

    encode() {
        ASSERT(type(this, Entity));

        return {
            id: this.id,
            name: this.name,
            description: this.description,
            data: this.data.encode(),
            _type: 'Entity'
        };
    }

    static decode(json) {
        ASSERT(exists(json) && exists(json.data));

        let data;
        if (json.data._type === 'TaskData') {
            data = TaskData.decode(json.data);
        } else if (json.data._type === 'EventData') {
            data = EventData.decode(json.data);
        } else if (json.data._type === 'ReminderData') {
            data = ReminderData.decode(json.data);
        } else {
            ASSERT(false, 'Unknown data type in Entity.decode.');
        }
        return new Entity(json.id, json.name, json.description, data);
    }

    // Utility to generate a simple unique ID (timestamp + random)
    static generateId() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let id = '';
        for (let i = 0; i < 8; i++) {
            id += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return id;
    }

    // Convert an array of AI JSON objects (tasks, events, reminders) into an array of Entity instances.
    // Each AI object must include at least { type: "task"|"event"|"reminder", name: "...", ... }
    static fromAiJson(aiObject, markPastDueComplete = true, excludeWithinDays = 0) {
        if(!exists(aiObject) || !type(aiObject, Object)) {
            return NULL;
        }
        
        if(!type(aiObject.type, NonEmptyString)) {
            log('Entity.fromAiJson: each item must have a type');
            return NULL;
        }
        if(AiReturnedNullField(aiObject.name)) {
            log('Entity.fromAiJson: each item must have a name');
            return NULL;
        }
        const name = aiObject.name;
        const description = AiReturnedNullField(aiObject.description) ? '' : aiObject.description;

        let data = NULL;
        if (aiObject.type === 'task') {
            data = TaskData.fromAiJson(aiObject, markPastDueComplete, excludeWithinDays);
        } else if (aiObject.type === 'event') {
            data = EventData.fromAiJson(aiObject);
        } else if (aiObject.type === 'reminder') {
            data = ReminderData.fromAiJson(aiObject);
        } else {
            log('Entity.fromAiJson: unknown item type ' + String(aiObject.type));
            return NULL;
        }

        if(data === NULL) {
            log('Entity.fromAiJson: data conversion failed');
            return NULL;
        }

        const id = Entity.generateId();
        try {
            const newEntity = new Entity(id, name, description, data);
            if(type(newEntity, Entity)) {
                return newEntity;
            } else {
                return NULL;
            }
        } catch (e) {
            log('Entity.fromAiJson: error creating entity');
            log(e);
            return NULL;
        }
    }
}

// nodes are the individual steps in the chain (type defined farther down)
class StrategySelectionNode {
    // unix start and end times
    constructor(strategy, startTime, endTime) {
        ASSERT(type(strategy, String));
        ASSERT(type(startTime, Int));
        ASSERT(type(endTime, Int));
        this.strategy = strategy;
        this.startTime = startTime;
        this.endTime = endTime;
    }

    encode() {
        ASSERT(type(this, StrategySelectionNode));
        return {
            strategy: this.strategy,
            startTime: this.startTime,
            endTime: this.endTime,
            _type: 'StrategySelectionNode'
        };
    }

    static decode(json) {
        ASSERT(exists(json));
        ASSERT(json._type === 'StrategySelectionNode');
        return new StrategySelectionNode(json.strategy, json.startTime, json.endTime);
    }
}

class RequestNode {
    constructor(model, typeOfPrompt, response, startTime, endTime, userPrompt, systemPrompt) {
        ASSERT(type(model, String));
        ASSERT(type(typeOfPrompt, String));
        ASSERT(type(response, String));
        ASSERT(type(startTime, Int));
        ASSERT(type(endTime, Int));
        ASSERT(type(userPrompt, String));
        ASSERT(type(systemPrompt, Union(String, NULL)));
        this.model = model;
        this.typeOfPrompt = typeOfPrompt;
        this.response = response;
        this.startTime = startTime;
        this.endTime = endTime;
        this.userPrompt = userPrompt;
        this.systemPrompt = systemPrompt;

        this.tokensUsed = 0;
        if (systemPrompt !== NULL) {
            this.tokensUsed += (systemPrompt.length / charactersPerToken);
        }
        this.tokensUsed += (userPrompt.length / charactersPerToken);
        this.tokensUsed += (response.length / charactersPerToken);
    }

    encode() {
        ASSERT(type(this, RequestNode));
        return {
            model: this.model,
            typeOfPrompt: this.typeOfPrompt,
            response: this.response,
            startTime: this.startTime,
            endTime: this.endTime,
            userPrompt: this.userPrompt,
            systemPrompt: this.systemPrompt === NULL ? symbolToString(NULL) : this.systemPrompt,
            _type: 'RequestNode'
        };
    }

    static decode(json) {
        ASSERT(exists(json));
        ASSERT(json._type === 'RequestNode');
        return new RequestNode(json.model, json.typeOfPrompt, json.response, json.startTime, json.endTime, json.userPrompt, json.systemPrompt);
    }

    static fromJson(object) {
        ASSERT(type(object, Object));
        ASSERT(exists(object.request));
        object = object.request;
        return new RequestNode(object.model, object.typeOfPrompt, object.response, object.startTime, object.endTime, object.userPrompt, object.systemPrompt);
    }
}

class ThinkingRequestNode {
    constructor(model, typeOfPrompt, response, thoughts, startTime, endTime, userPrompt, systemPrompt) {
        ASSERT(type(model, String));
        ASSERT(type(typeOfPrompt, String));
        ASSERT(type(response, String));
        ASSERT(type(thoughts, Union(String, NULL))); // NULL if the thinking was unfindable
        ASSERT(type(startTime, Int));
        ASSERT(type(endTime, Int));
        ASSERT(type(userPrompt, String));
        ASSERT(type(systemPrompt, Union(String, NULL)));
        this.model = model;
        this.typeOfPrompt = typeOfPrompt;
        this.response = response;
        this.thoughts = thoughts;
        this.startTime = startTime;
        this.endTime = endTime;
        this.userPrompt = userPrompt;
        this.systemPrompt = systemPrompt;
    }

    encode() {
        ASSERT(type(this, ThinkingRequestNode));
        let thoughtsString = this.thoughts === NULL ? symbolToString(NULL) : this.thoughts;
        return {
            model: this.model,
            typeOfPrompt: this.typeOfPrompt,
            response: this.response,
            thoughts: thoughtsString,
            startTime: this.startTime,
            endTime: this.endTime,
            userPrompt: this.userPrompt,
            systemPrompt: this.systemPrompt === NULL ? symbolToString(NULL) : this.systemPrompt,
            _type: 'ThinkingRequestNode'
        };
    }

    static decode(json) {
        ASSERT(exists(json));
        ASSERT(json._type === 'ThinkingRequestNode');
        let thoughts = json.thoughts === symbolToString(NULL) ? NULL : json.thoughts;
        let systemPrompt = json.systemPrompt === symbolToString(NULL) ? NULL : json.systemPrompt;
        return new ThinkingRequestNode(json.model, json.typeOfPrompt, json.response, thoughts, json.startTime, json.endTime, json.userPrompt, systemPrompt);
    }

    static fromJson(object) {
        ASSERT(type(object, Object));
        ASSERT(exists(object.thinking_request));
        object = object.thinking_request;
        let thoughts = object.thoughts === symbolToString(NULL) ? NULL : object.thoughts;
        let systemPrompt = object.systemPrompt === symbolToString(NULL) ? NULL : object.systemPrompt;
        return new ThinkingRequestNode(object.model, object.typeOfPrompt, object.response, thoughts, object.startTime, object.endTime, object.userPrompt, systemPrompt);
    }
}

class RerouteToModelNode {
    constructor(model, startTime, endTime) {
        ASSERT(type(model, String));
        ASSERT(type(startTime, Int));
        ASSERT(type(endTime, Int));
        this.model = model;
        this.startTime = startTime;
        this.endTime = endTime;
    }

    encode() {
        ASSERT(type(this, RerouteToModelNode));
        return {
            model: this.model,
            startTime: this.startTime,
            endTime: this.endTime,
            _type: 'RerouteToModelNode'
        };
    }

    static decode(json) {
        ASSERT(exists(json));
        ASSERT(json._type === 'RerouteToModelNode');
        return new RerouteToModelNode(json.model, json.startTime, json.endTime);
    }

    static fromJson(object) {
        ASSERT(type(object, Object));
        ASSERT(exists(object.rerouteToModel));
        object = object.rerouteToModel;
        return new RerouteToModelNode(object.model, object.startTime, object.endTime);
    }
}

class UserPromptNode {
    constructor(prompt) {
        ASSERT(type(prompt, String));
        this.prompt = prompt;
    }
    
    encode() {
        ASSERT(type(this, UserPromptNode));
        return {
            prompt: this.prompt,
            _type: 'UserPromptNode'
        };
    }

    static decode(json) {
        ASSERT(exists(json));
        ASSERT(json._type === 'UserPromptNode');
        return new UserPromptNode(json.prompt);
    }
}

class UserAttachmentNode {
    constructor(file) {
        ASSERT(exists(file) && exists(file.name) && exists(file.mimeType) && exists(file.size));
        ASSERT(type(file.name, NonEmptyString));
        ASSERT(type(file.mimeType, NonEmptyString));
        ASSERT(type(file.size, Int));
        ASSERT(file.size >= 0);
        // we don't store the file because it would take up too much space
        this.fileName = file.name;
        this.mimeType = file.mimeType;
        this.size = file.size;
        this.tokensUsed;

        // from my testing, 1kb of image translates to 1 token
        // I don't understand why, but this is what Gemini says
        if (this.mimeType.startsWith('image/')) {
            this.tokensUsed = this.size * (1/1000);
        } else if (this.mimeType.startsWith('text/')) {
            this.tokensUsed = this.size * charactersPerToken;
        } else if (this.mimeType.startsWith('application/pdf')) {
            this.tokensUsed = this.size * (1/100);
        }
    }

    encode() {
        ASSERT(type(this, UserAttachmentNode));
        return {
            fileName: this.fileName,
            mimeType: this.mimeType,
            size: this.size,
            _type: 'UserAttachmentNode'
        };
    }

    static decode(json) {
        ASSERT(exists(json));
        ASSERT(json._type === 'UserAttachmentNode');
        return new UserAttachmentNode({name: json.fileName, mimeType: json.mimeType, size: json.size});
    }
}

class ProcessingNode {
    constructor(response, startTime, description, endTime) {
        ASSERT(type(response, Union(String, NULL)));
        ASSERT(type(startTime, Int));
        ASSERT(type(description, NonEmptyString));
        ASSERT(type(endTime, Int));
        this.response = response;
        this.startTime = startTime;
        this.endTime = endTime;
        this.description = description;
    }

    encode() {
        ASSERT(type(this, ProcessingNode));
        return {
            response: this.response,
            startTime: this.startTime,
            endTime: this.endTime,
            description: this.description,
            _type: 'ProcessingNode'
        };
    }

    static decode(json) {
        ASSERT(exists(json));
        ASSERT(json._type === 'ProcessingNode');
        return new ProcessingNode(json.response, json.startTime, json.endTime, json.description);
    }
}

class CreatedEntityNode {
    constructor(json, entity, startTime, endTime) {
        ASSERT(type(json, Object));
        ASSERT(type(entity, Entity));
        ASSERT(type(startTime, Int));
        ASSERT(type(endTime, Int));

        // create a copy of the entity
        let entityCopy = Entity.decode(entity.encode());
        
        this.json = json;
        this.entity = entityCopy;
        this.startTime = startTime;
        this.endTime = endTime;
    }

    encode() {
        ASSERT(type(this, CreatedEntityNode));
        return {
            json: this.json,
            entity: this.entity.encode(),
            startTime: this.startTime,
            endTime: this.endTime,
            _type: 'CreatedEntityNode'
        };
    }

    static decode(json) {
        ASSERT(exists(json));
        ASSERT(json._type === 'CreatedEntityNode');
        return new CreatedEntityNode(json.json, json.entity, json.startTime, json.endTime);
    }
}

class FailedToCreateEntityNode {
    constructor(json, startTime, endTime) {
        ASSERT(type(json, Object));
        ASSERT(type(startTime, Int));
        ASSERT(type(endTime, Int));
        this.json = json;
        this.startTime = startTime;
        this.endTime = endTime;
    }

    encode() {
        ASSERT(type(this, FailedToCreateEntityNode));
        return {
            json: this.json,
            startTime: this.startTime,
            endTime: this.endTime,
            _type: 'FailedToCreateEntityNode'
        };
    }

    static decode(json) {
        ASSERT(exists(json));
        ASSERT(json._type === 'FailedToCreateEntityNode');
        return new FailedToCreateEntityNode(json.json, json.startTime, json.endTime);
    }
}

class MergeEntitiesNode {
    constructor(entityArray, result, startTime, endTime) {
        ASSERT(type(entityArray, List(Entity)));
        ASSERT(entityArray.length >= 2);
        ASSERT(type(result, Entity));
        ASSERT(type(startTime, Int));
        ASSERT(startTime >= 0);
        ASSERT(type(endTime, Int));

        // create copies of the entities
        let entityArrayCopy = [];
        for (const entity of entityArray) {
            entityArrayCopy.push(Entity.decode(entity.encode()));
        }
        let resultCopy = Entity.decode(result.encode());

        this.entityArray = entityArrayCopy;
        this.result = resultCopy;
        this.startTime = startTime;
        this.endTime = endTime;
    }

    encode() {
        ASSERT(type(this, MergeEntitiesNode));
        return {
            entityArray: this.entityArray.map(entity => entity.encode()),
            result: this.result.encode(),
            startTime: this.startTime,
            endTime: this.endTime,
            _type: 'MergeEntitiesNode'
        };
    }

    static decode(json) {
        ASSERT(exists(json));
        ASSERT(json._type === 'MergeEntitiesNode');
        let entityArray = [];
        for (const entityJson of json.entityArray) {
            entityArray.push(Entity.decode(entityJson));
        }
        ASSERT(type(entityArray, List(Entity)));
        ASSERT(entityArray.length >= 2);
        let result = Entity.decode(json.result);
        ASSERT(type(result, Entity));
        return new MergeEntitiesNode(entityArray, result, json.startTime, json.endTime);
    }
}

class FormatEntityTitlesNode {
    constructor(startTime, endTime, entityTitleMap = {}) {
        ASSERT(type(startTime, Int));
        ASSERT(type(endTime, Int));
        ASSERT(startTime <= endTime);
        ASSERT(type(entityTitleMap, Object));
        this.startTime = startTime;
        this.endTime = endTime;
        this.entityTitleMap = entityTitleMap; // keys: id, values: { old, new }
    }

    encode() {
        ASSERT(type(this, FormatEntityTitlesNode));
        return {
            startTime: this.startTime,
            endTime: this.endTime,
            entityTitleMap: this.entityTitleMap,
            _type: 'FormatEntityTitlesNode'
        };
    }

    static decode(json) {
        ASSERT(exists(json));
        ASSERT(json._type === 'FormatEntityTitlesNode');
        return new FormatEntityTitlesNode(json.startTime, json.endTime, json.entityTitleMap || {});
    }
}

// when we perform multiple actions in parallel, we use this node
class ParallelNode {
    // preliminary construction
    constructor(description) {
        ASSERT(type(description, NonEmptyString));
        this.nodes = [];
        this.startTime = Date.now();
        this.endTime = NULL;
        this.description = description;
    }

    add(node) {
        ASSERT(type(node, Union(nodesUnionType, Chain)));
        this.nodes.push(node);
    }

    // finished construction after adding all nodes
    complete() {
        this.endTime = Date.now();
    }

    encode() {
        ASSERT(type(this, ParallelNode));
        return {
            nodes: this.nodes.map(node => node.encode()),
            startTime: this.startTime,
            endTime: this.endTime,
            description: this.description,
            _type: 'ParallelNode'
        };
    }

    static decode(json) {
        ASSERT(exists(json));
        ASSERT(json._type === 'ParallelNode');
        let nodes = [];
        for (const nodeJson of json.nodes) {
            nodes.push(decodeNode(nodeJson));
        }
        ASSERT(type(nodes, List(Node)));
        return new ParallelNode(json.description, nodes, json.startTime, json.endTime);
    }
}

class CompleteRequestNode {
    constructor(startTime) {
        ASSERT(type(startTime, Int));
        this.startTime = startTime;
        this.endTime = Date.now();
    }
}

function decodeNode(nodeJson) {
    ASSERT(exists(nodeJson));
    if (nodeJson._type === 'StrategySelectionNode') {
        return StrategySelectionNode.decode(nodeJson);
    } else if (nodeJson._type === 'RequestNode') {
        return RequestNode.decode(nodeJson);
    } else if (nodeJson._type === 'ThinkingRequestNode') {
        return ThinkingRequestNode.decode(nodeJson);
    } else if (nodeJson._type === 'RerouteToModelNode') {
        return RerouteToModelNode.decode(nodeJson);
    } else if (nodeJson._type === 'UserPromptNode') {
        return UserPromptNode.decode(nodeJson);
    } else if (nodeJson._type === 'UserAttachmentNode') {
        return UserAttachmentNode.decode(nodeJson);
    } else if (nodeJson._type === 'ProcessingNode') {
        return ProcessingNode.decode(nodeJson);
    } else if (nodeJson._type === 'CreatedEntityNode') {
        return CreatedEntityNode.decode(nodeJson);
    } else if (nodeJson._type === 'FailedToCreateEntityNode') {
        return FailedToCreateEntityNode.decode(nodeJson);
    } else if (nodeJson._type === 'MergeEntitiesNode') {
        return MergeEntitiesNode.decode(nodeJson);
    } else if (nodeJson._type === 'CompleteRequestNode') {
        return CompleteRequestNode.decode(nodeJson);
    } else if (nodeJson._type === 'ParallelNode') {
        return ParallelNode.decode(nodeJson);
    } else if (nodeJson._type === 'FormatEntityTitlesNode') {
        return FormatEntityTitlesNode.decode(nodeJson);
    } else {
        ASSERT(false, 'ParallelNode.decode: unknown node type ' + nodeJson._type);
    }
}

let nodesUnionType = Union(
    StrategySelectionNode,
    RequestNode,
    ThinkingRequestNode,
    RerouteToModelNode,
    UserPromptNode,
    UserAttachmentNode,
    ProcessingNode,
    CreatedEntityNode,
    FailedToCreateEntityNode,
    MergeEntitiesNode,
    CompleteRequestNode,
    ParallelNode,
    FormatEntityTitlesNode
);

// chain of events involved in a single user AI request
// this contains a lot of data we don't need, but it exists to show the user
class Chain {
    constructor() {
        this.chain = [];
        this.startTime = Date.now();
        this.endTime = NULL;
    }

    validate() {
        ASSERT(exists(this));
        ASSERT(type(this.chain, List(nodesUnionType)));
        ASSERT(type(this.startTime, Int));
        ASSERT(this.startTime >= 0);
        ASSERT(exists(this.endTime));
        if (this.endTime === NULL) {
            // valid
        } else if (type(this.endTime, Int)) {
            ASSERT(this.endTime >= this.startTime);
        } else {
            ASSERT(false, 'Chain.validate: endTime is not a valid type');
        }
    }

    add(node) {
        this.validate();
        if (this.endTime !== NULL) {
            ASSERT(false, 'Chain.add: chain is already complete');
        }
        ASSERT(type(node, nodesUnionType));
        this.chain.push(node);
    }

    static nodeFromJson(nodeObject) {
        ASSERT(type(nodeObject, Object));

        if (exists(nodeObject.request)) {
            let node = RequestNode.fromJson(nodeObject);
            return node;
        } else if (exists(nodeObject.thinking_request)) {
            if (!exists(nodeObject.thinking_request.thoughts)) {
                // the thinking hasn't been parse yet
                if (nodeObject.thinking_request.response.includes('<think>') && nodeObject.thinking_request.response.includes('</think>')) {
                    // we have a thinking tag in the response
                    let content = nodeObject.thinking_request.response.split('<think>')[1];
                    let [thinking, response] = content.split('</think>');
                    nodeObject.thinking_request.thoughts = thinking.trim();
                    nodeObject.thinking_request.response = response.trim();
                } else {
                    // just let the thinking be NULL if it was unfindable
                    nodeObject.thinking_request.thoughts = NULL;
                }
            }

            if (!exists(nodeObject.thinking_request.systemPrompt)) {
                nodeObject.thinking_request.systemPrompt = NULL;
            }

            return ThinkingRequestNode.fromJson(nodeObject);
        } else if (exists(nodeObject.rerouteToModel)) {
            return RerouteToModelNode.fromJson(nodeObject);
        } else {
            ASSERT(false, 'Chain.nodeFromJson: unknown node type ' + JSON.stringify(nodeObject));
        }
    }

    // calculate how many tokens were used
    calculateTokensUsed() {
        let totalTokensUsed = 0;
        for (const node of this.chain) {
            if (type(node, RequestNode)) {
                totalTokensUsed += node.tokensUsed;
            } else if (type(node, ThinkingRequestNode)) {
                totalTokensUsed += node.tokensUsed;
            } else if (type(node, UserAttachmentNode)) {
                totalTokensUsed += node.tokensUsed;
            }
        }

        return totalTokensUsed;
    }

    // we have finished answering the user's request
    // calculate how many tokens were used
    completeRequest() {
        this.add(new CompleteRequestNode(this.startTime));
        this.endTime = Date.now();
    }
    
    encode() {
        this.validate();
        // TODO
    }

    static decode(json) {
        ASSERT(exists(json));
        // TODO
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
        ASSERT(plan === "free" || plan === "pro-monthly" || plan === "pro-annually" || plan === "godmode");
        ASSERT(type(timestamp, Int));
        ASSERT(timestamp >= 0);
        ASSERT(type(paymentTimes, Dict(String, Number)), "payment did not match expected type: " + String(paymentTimes));
        for (const [paymentTime, amount] of Object.entries(paymentTimes)) {
            ASSERT(parseInt(paymentTime) >= 0);
            ASSERT(amount >= 0);
        }

        // Assert that both userId and email are null, or both are non-null
        ASSERT((userId === NULL && email === NULL) || (userId !== NULL && email !== NULL), "userId and email must both be null or both be non-null");
        
        // Validate settings structure
        ASSERT(settings.ampmOr24 === 'ampm' || settings.ampmOr24 === '24');
        // how many hours to offset
        ASSERT(type(settings.hideEmptyTimespanInCalendar, Boolean));
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
    encode() {
        ASSERT(type(this, User));
        let entityArrayJson = [];
        for (const entity of this.entityArray) {
            entityArrayJson.push(entity.encode());
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
            userId: this.userId === NULL ? symbolToString(NULL) : this.userId,
            email: this.email === NULL ? symbolToString(NULL) : this.email,
            dataspec: 1, // first dataspec version
            usage: this.usage,
            timestamp: this.timestamp,
            plan: this.plan,
            paymentTimes: this.paymentTimes,
            _type: 'User'
        };
    }

    static decode(json) {
        ASSERT(exists(json));
        ASSERT(json._type === 'User');
        ASSERT(exists(json.data));
        ASSERT(type(json.data, String));
        ASSERT(type(json.dataspec, Int));
        if (json.userId === symbolToString(NULL)) {
            json.userId = NULL;
        }
        if (json.email === symbolToString(NULL)) {
            json.email = NULL;
        }
        ASSERT(type(json.userId, Union(String, NULL)));
        ASSERT(type(json.email, Union(String, NULL)));
        ASSERT(type(json.usage, Int));
        ASSERT(json.usage >= 0);
        ASSERT(type(json.timestamp, Int));
        ASSERT(type(json.plan, String));
        ASSERT(json.plan === "free" || json.plan === "pro-monthly" || json.plan === "pro-annually" || json.plan === "godmode");
        ASSERT(type(json.paymentTimes, Dict(String, Number)));
        
        for (const [paymentTime, amount] of Object.entries(json.paymentTimes)) {
            ASSERT(parseInt(paymentTime) >= 0);
            ASSERT(amount >= 0);
        }

        if (json.dataspec === 1) {
            // the backend returns this if a user was just created
            if (json.data == '{}') {
                // use the default user data
                let defaultUser = User.createDefault();
                return new User(
                    defaultUser.entityArray,
                    defaultUser.settings,
                    defaultUser.palette,
                    json.userId,
                    json.email,
                    json.usage,
                    json.timestamp,
                    json.plan,
                    json.paymentTimes
                );
            }
            let data = JSON.parse(json.data);
            ASSERT(type(data, Object));
            ASSERT(exists(data.entityArray));
            ASSERT(type(data.entityArray, List(Object)));
            ASSERT(exists(data.settings));
            ASSERT(type(data.settings.hideEmptyTimespanInCalendar, Boolean));
            ASSERT(type(data.settings.ampmOr24, String));
            ASSERT(data.settings.ampmOr24 === 'ampm' || data.settings.ampmOr24 === '24');
            ASSERT(exists(data.palette));
            ASSERT(type(data.palette.accent, List(String)));
            ASSERT(type(data.palette.shades, List(String)));
            ASSERT(type(data.palette.events, List(String)));
            ASSERT(data.palette.accent.length === 2);
            ASSERT(data.palette.shades.length === 5);
            ASSERT(data.palette.events.length === 5);
            let entityArray = [];
            for (const entityJson of data.entityArray) {
                entityArray.push(Entity.decode(entityJson));
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
                hideEmptyTimespanInCalendar: true,
            },
            palettes.dark,
            NULL, // userId
            NULL, // email
            0, // usage
            Date.now(), // timestamp
            "free", // plan
            {} // paymentTimes
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
    constructor(id, name, startDateTime, endDateTime, originalStartDate, originalStartTime, wrapToPreviousDay, wrapToNextDay, instanceKind, taskIsComplete, patternIndex, ambiguousEndTime) {
        ASSERT(type(id, NonEmptyString));
        ASSERT(type(name, String)); // Name can be empty for some generated items if needed
        ASSERT(type(startDateTime, Int));
        ASSERT(type(endDateTime, Int));
        ASSERT(startDateTime <= endDateTime, "FilteredSegmentOfDayInstance: startDateTime must be less than or equal to endDateTime");
        ASSERT(type(originalStartDate, DateField), "FilteredSegmentOfDayInstance: originalStartDate must be a DateField. Received: " + String(originalStartDate));
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
    }

    // No encode or decode because these aren't stored long-term
}

// FilteredAllDayInstance class for calendar rendering (all-day section)
class FilteredAllDayInstance {
    constructor(id, name, date, instanceKind, taskIsComplete, ignore, patternIndex) {
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

        this.id = id;
        this.name = name;
        this.date = date;
        this.instanceKind = instanceKind;
        this.taskIsComplete = taskIsComplete;
        this.ignore = ignore;
        this.patternIndex = patternIndex;
    }

    // No encode or decode needed
}

// FilteredReminderInstance class for calendar rendering
class FilteredReminderInstance {
    constructor(id, name, dateTime, originalDate, originalTime, patternIndex) {
        ASSERT(type(id, NonEmptyString));
        ASSERT(type(name, String));
        ASSERT(type(dateTime, Int)); // Unix timestamp for the reminder's time
        ASSERT(type(originalDate, DateField)); // The original date from the pattern or non-recurring instance
        ASSERT(type(originalTime, TimeField));
        ASSERT(type(patternIndex, Int));

        this.id = id;
        this.name = name;
        this.dateTime = dateTime;
        this.originalDate = originalDate;
        this.originalTime = originalTime;
        this.patternIndex = patternIndex;
    }

    // No encode or decode needed
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
    if (!exists(thing)) {
        return false;
    }
    if (!exists(sometype)) {
        return false;
    }
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
        try { new RecurrenceCount(DateField.decode(thing.initialDate), thing.count); return true; } catch (e) { return false; }
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
        try { new User(thing.entityArray, thing.settings, thing.palette, thing.userId, thing.email, thing.usage, thing.timestamp, thing.plan, thing.paymentTimes); return true; } catch (e) { return false; }
    } else if (sometype === Chain) {
        if (!(thing instanceof Chain)) return false;
        try { new Chain(thing.chain, thing.initializationTime); return true; } catch (e) { return false; }
    } else if (sometype === RequestNode) {
        if (!(thing instanceof RequestNode)) return false;
        try { new RequestNode(thing.model, thing.typeOfPrompt, thing.response, thing.startTime, thing.endTime, thing.userPrompt, thing.systemPrompt); return true; } catch (e) { return false; }
    } else if (sometype === RerouteToModelNode) {
        if (!(thing instanceof RerouteToModelNode)) return false;
        try { new RerouteToModelNode(thing.model, thing.startTime, thing.endTime); return true; } catch (e) { return false; }
    } else if (sometype === UserPromptNode) {
        if (!(thing instanceof UserPromptNode)) return false;
        try { new UserPromptNode(thing.prompt); return true; } catch (e) { return false; }
    } else if (sometype === UserAttachmentNode) {
        if (!(thing instanceof UserAttachmentNode)) return false;
        try { new UserAttachmentNode({name: thing.fileName, mimeType: thing.mimeType, size: thing.size}); return true; } catch (e) { return false; }
    } else if (sometype === ProcessingNode) {
        if (!(thing instanceof ProcessingNode)) return false;
        try { new ProcessingNode(thing.response, thing.startTime, thing.description, thing.endTime); return true; } catch (e) { return false; }
    } else if (sometype === CreatedEntityNode) {
        if (!(thing instanceof CreatedEntityNode)) return false;
        try { new CreatedEntityNode(thing.json, thing.entity, thing.startTime, thing.endTime); return true; } catch (e) { return false; }
    } else if (sometype === FailedToCreateEntityNode) {
        if (!(thing instanceof FailedToCreateEntityNode)) return false;
        try { new FailedToCreateEntityNode(thing.json, thing.startTime, thing.endTime); return true; } catch (e) { return false; }
    } else if (sometype === MergeEntitiesNode) {
        if (!(thing instanceof MergeEntitiesNode)) return false;
        try { new MergeEntitiesNode(thing.entityArray, thing.result, thing.startTime, thing.endTime); return true; } catch (e) { return false; }
    } else if (sometype === StrategySelectionNode) {
        if (!(thing instanceof StrategySelectionNode)) return false;
        try { new StrategySelectionNode(thing.strategy, thing.startTime, thing.endTime); return true; } catch (e) { return false; }
    } else if (sometype === ThinkingRequestNode) {
        if (!(thing instanceof ThinkingRequestNode)) return false;
        try { new ThinkingRequestNode(thing.model, thing.typeOfPrompt, thing.response, thing.thoughts, thing.startTime, thing.endTime, thing.userPrompt, thing.systemPrompt); return true; } catch (e) { return false; }
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