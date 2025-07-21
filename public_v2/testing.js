async function testContinously() {
    // Wait for user to be initialized
    while (typeof user === 'undefined') {
        await sleep(0.01);
    }
    
    while (true) {
        await sleep(0.1);

        let columns = numberOfColumns();
        ASSERT(Number.isInteger(columns), "numberOfColumns must return an integer");
        ASSERT(columns >= 1 && columns <= 8, `numberOfColumns value out of range: ${columns}`);

        // recursively scrape HTML for element to look for leading whitespace
        // disallowed unless element has data-leadingWhitespace="true" attribute
        // set in js with element.dataset.leadingWhitespace = "true"
        // only check elements within the body
        let elements = HTML.body.querySelectorAll('*');
        elements.forEach(element => {
            let hasLeadingWhitespace = element.innerHTML.match(/^\s+/);
            ASSERT(!hasLeadingWhitespace || HTML.getDataUnsafely(element, "leadingWhitespace") === NULL || HTML.getData(element, "leadingWhitespace") === true, `Leading whitespace detected in element without data-leadingWhitespace attribute: ${element.outerHTML}`);
        });
    }
}

testContinously();

// for quickly resetting via console
function resetUserData() {
    user.entityArray = [];
    saverUserData();
}

// Alarm generation tests
async function runAlarmTests() {
    // Wait until utils and user are loaded
    while (typeof DateField === 'undefined' || typeof TaskData === 'undefined') {
        await sleep(0.01);
    }

    const now = new Date();
    const MS_PER_MIN = 60 * 1000;

    // Helper to create DateField from JS Date
    const df = (dt) => new DateField(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());

    // ------- TaskData Non-Recurring -------
    const tomorrow = new Date(now.getTime() + MS_PER_DAY);
    const taskDueDate = df(tomorrow);
    const taskDueTime = new TimeField(10, 0); // 10:00
    const nrTaskInst = new NonRecurringTaskInstance(taskDueDate, taskDueTime, false);
    const taskData = new TaskData([nrTaskInst], NULL, true, [], 10); // 10-min alarm

    let alarms = taskData.getAlarmTimes(Date.now(), Date.now() + 2 * MS_PER_DAY);
    const expectedTaskAlarm = dueUnixTimestamp(taskDueDate, taskDueTime) - 10 * MS_PER_MIN;
    ASSERT(alarms.length === 1 && alarms[0].time === expectedTaskAlarm, "TaskData non-recurring alarm failed");

    // ------- EventData Non-Recurring (start & end) -------
    const evStartDate = df(tomorrow);
    const evStartTime = new TimeField(9, 0);
    const evEndTime = new TimeField(10, 0);
    const nrEventInst = new NonRecurringEventInstance(evStartDate, evStartTime, evEndTime, NULL);
    const eventData = new EventData([nrEventInst], 10, 5); // 10-min before start, 5-min before end

    alarms = eventData.getAlarmTimes(Date.now(), Date.now() + 2 * MS_PER_DAY);
    const evStartUnix = evStartDate.toUnixTimestamp() + 9 * 60 * MS_PER_MIN;
    const evStartAlarm = evStartUnix - 10 * MS_PER_MIN;
    const evEndUnix = evStartDate.toUnixTimestamp() + 10 * 60 * MS_PER_MIN;
    const evEndAlarm = evEndUnix - 5 * MS_PER_MIN;
    ASSERT(alarms.some(a => a.time === evStartAlarm && !a.isEnd), "EventData start alarm missing");
    ASSERT(alarms.some(a => a.time === evEndAlarm && a.isEnd), "EventData end alarm missing");

    // ------- ReminderData Non-Recurring -------
    const remDate = df(tomorrow);
    const remTime = new TimeField(8, 0);
    const nrRemInst = new NonRecurringReminderInstance(remDate, remTime);
    const reminderData = new ReminderData([nrRemInst], true);
    alarms = reminderData.getAlarmTimes(Date.now(), Date.now() + 2 * MS_PER_DAY);
    const remExpected = remDate.toUnixTimestamp() + 8 * 60 * MS_PER_MIN;
    ASSERT(alarms.length === 1 && alarms[0].time === remExpected, "ReminderData non-recurring alarm failed");

    log("Alarm tests completed");
}

// Run alarm tests after slight delay to ensure environment ready
setTimeout(() => { runAlarmTests(); }, 1000);