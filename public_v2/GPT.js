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

// Main function to check if a task is complete
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