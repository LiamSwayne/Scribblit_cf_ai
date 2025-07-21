async function testContinously() {
    // Wait for main.js to initialize
    while (typeof hasInitialized === 'undefined' || !hasInitialized) {
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
    // Wait until main.js has initialized
    while (typeof hasInitialized === 'undefined' || !hasInitialized) {
        await sleep(0.01);
    }

    const DateTime = luxon.DateTime;
    const baseDate = DateTime.local();
    const now_ts = baseDate.toMillis();
    const future_ts = baseDate.plus({ days: 2 }).toMillis();

    const tomorrowDate = baseDate.plus({days: 1});
    const tomorrow = new DateField(tomorrowDate.year, tomorrowDate.month, tomorrowDate.day);

    // ------- TaskData Non-Recurring -------
    const taskData = new TaskData(
        [new NonRecurringTaskInstance(tomorrow, new TimeField(10, 0), false)],
        NULL, true, [], 10
    );
    let alarms = taskData.getAlarmTimes(now_ts, future_ts);
    const expectedTaskAlarm = dueUnixTimestamp(tomorrow, new TimeField(10, 0)) - 10 * 60 * 1000;
    ASSERT(alarms.length === 1 && alarms[0].time === expectedTaskAlarm, "TaskData non-recurring alarm failed");

    // ------- EventData Non-Recurring (start & end) -------
    const eventData = new EventData(
        [new NonRecurringEventInstance(tomorrow, new TimeField(9, 0), new TimeField(10, 0), NULL)],
        10, 5
    );
    alarms = eventData.getAlarmTimes(now_ts, future_ts);
    const evStartUnix = tomorrow.toUnixTimestamp() + 9 * 60 * 60 * 1000;
    const evStartAlarm = evStartUnix - 10 * 60 * 1000;
    const evEndUnix = tomorrow.toUnixTimestamp() + 10 * 60 * 60 * 1000;
    const evEndAlarm = evEndUnix - 5 * 60 * 1000;
    ASSERT(alarms.some(a => a.time === evStartAlarm && !a.isEnd), "EventData start alarm missing");
    ASSERT(alarms.some(a => a.time === evEndAlarm && a.isEnd), "EventData end alarm missing");

    // ------- ReminderData Non-Recurring -------
    const reminderData = new ReminderData(
        [new NonRecurringReminderInstance(tomorrow, new TimeField(8, 0))],
        true
    );
    alarms = reminderData.getAlarmTimes(now_ts, future_ts);
    const remExpected = tomorrow.toUnixTimestamp() + 8 * 60 * 60 * 1000;
    ASSERT(alarms.length === 1 && alarms[0].time === remExpected, "ReminderData non-recurring alarm failed");
}

// Run alarm tests after slight delay to ensure environment ready
setTimeout(() => { runAlarmTests(); }, 1000);