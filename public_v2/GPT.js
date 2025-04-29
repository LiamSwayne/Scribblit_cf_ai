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