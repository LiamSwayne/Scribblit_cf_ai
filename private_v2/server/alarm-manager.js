// Import SEND function from main.js
function SEND(body, statusCode = 200) {
    return new Response(JSON.stringify(body), {
        status: statusCode,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        }
    });
}

export class AlarmManager {
    constructor(state, env) {
        this.state = state;
        this.env = env;
    }

    async fetch(request) {
        const url = new URL(request.url);
        
        if (url.pathname === '/update-alarms' && request.method === 'POST') {
            try {
                const { alarmTable, email } = await request.json();
                await this.updateAlarms(alarmTable, email);
                return SEND({ success: true });
            } catch (error) {
                console.error('Error updating alarms:', error);
                return SEND({ error: 'Failed to update alarms' }, 500);
            }
        }
        
        if (url.pathname === '/clear-alarms' && request.method === 'POST') {
            try {
                await this.clearAllAlarms();
                return SEND({ success: true });
            } catch (error) {
                console.error('Error clearing alarms:', error);
                return SEND({ error: 'Failed to clear alarms' }, 500);
            }
        }
        
        return SEND({ error: 'Not found' }, 404);
    }

    async updateAlarms(alarmTable, email) {
        console.log(`📥 Updating alarms for: ${email}`);
        console.log(`📊 Alarm table length: ${alarmTable.length}`);
        
        // Store user email and full alarm table in Durable Object storage
        await this.state.storage.put('userEmail', email);
        await this.state.storage.put('alarmTable', alarmTable);
        
        // Clear existing alarm
        await this.clearAllAlarms();
        console.log(`🧹 All alarms cleared`);

        // Find the next upcoming alarm (earliest time after now)
        const now = Date.now();
        const futureAlarms = alarmTable.filter(alarm => alarm.unixTime > now);
        
        if (futureAlarms.length === 0) {
            console.log(`⚠️ No future alarms to set for ${email}`);
            return;
        }
        
        // Sort by time and get the earliest
        futureAlarms.sort((a, b) => a.unixTime - b.unixTime);
        const nextAlarm = futureAlarms[0];

        try {
            // Set only the next upcoming alarm
            await this.state.storage.setAlarm(nextAlarm.unixTime);
            
            // Store current alarm details
            await this.state.storage.put('currentAlarm', {
                name: nextAlarm.name,
                id: nextAlarm.id,
                cronPattern: nextAlarm.cronPattern,
                unixTime: nextAlarm.unixTime,
                emailSubject: nextAlarm.emailSubject,
                emailContent: nextAlarm.emailContent
            });
            
            console.log(`⏰ Set NEXT alarm for ${new Date(nextAlarm.unixTime).toISOString()}: ${nextAlarm.name}`);
            console.log(`📅 Skipped ${futureAlarms.length - 1} future alarms (will be set after this one fires)`);
            
        } catch (error) {
            console.error(`❌ Failed to set next alarm:`, error);
        }

        console.log(`✅ Next alarm scheduled for user: ${email}`);
    }

    async clearAllAlarms() {
        // Cloudflare Durable Objects: calling deleteAlarm() without timestamp clears all alarms
        await this.state.storage.deleteAlarm();
        console.log('All alarms cleared');
    }

    async alarm() {
        // This method is called when the alarm fires
        const alarmTime = Date.now();
        console.log(`🚨🚨🚨 ALARM FIRED at ${new Date(alarmTime).toISOString()} 🚨🚨🚨`);
        
        // Get stored user email and current alarm
        const userEmail = await this.state.storage.get('userEmail');
        const currentAlarm = await this.state.storage.get('currentAlarm');
        const alarmTable = await this.state.storage.get('alarmTable');
        
        console.log(`📧 User email from storage: ${userEmail}`);
        console.log(`🎯 Fired alarm: ${currentAlarm ? currentAlarm.name : 'Unknown'}`);
        
        if (!userEmail) {
            console.error(`❌ No user email found in storage!`);
            return;
        }
        
        // Send email for the fired alarm
        const alarmName = currentAlarm ? currentAlarm.name : 'Unknown Reminder';
        const emailSubject = currentAlarm && currentAlarm.emailSubject ? `⏰ ${currentAlarm.emailSubject.replace(/^⏰\s*/, '')}` : `⏰ Reminder: ${alarmName}`;
        const emailContent = currentAlarm && currentAlarm.emailContent ? currentAlarm.emailContent : `${alarmName} at ${new Date(alarmTime).toLocaleString()}\n\nScribblit`;
        
        console.log(`📤 Sending alarm notification to: ${userEmail} for "${alarmName}"`);
        
        try {
            await this.sendEmail(
                this.env.SENDGRID_API_KEY,
                userEmail,
                emailSubject,
                emailContent
            );
            console.log(`✅✅✅ ALARM EMAIL SENT SUCCESSFULLY to ${userEmail} for "${alarmName}" ✅✅✅`);
        } catch (error) {
            console.error(`❌❌❌ FAILED TO SEND ALARM EMAIL:`, error);
            console.error(`❌ Email details: to=${userEmail}, subject="⏰ Reminder: ${alarmName}"`);
        }
        
        // Set the next alarm from the table
        if (alarmTable && alarmTable.length > 0) {
            const now = Date.now();
            const futureAlarms = alarmTable.filter(alarm => alarm.unixTime > now);
            
            if (futureAlarms.length > 0) {
                futureAlarms.sort((a, b) => a.unixTime - b.unixTime);
                const nextAlarm = futureAlarms[0];
                
                try {
                    await this.state.storage.setAlarm(nextAlarm.unixTime);
                    await this.state.storage.put('currentAlarm', {
                        name: nextAlarm.name,
                        id: nextAlarm.id,
                        cronPattern: nextAlarm.cronPattern,
                        unixTime: nextAlarm.unixTime,
                        emailSubject: nextAlarm.emailSubject,
                        emailContent: nextAlarm.emailContent
                    });
                    console.log(`🔄 Set NEXT alarm for ${new Date(nextAlarm.unixTime).toISOString()}: ${nextAlarm.name}`);
                } catch (error) {
                    console.error(`❌ Failed to set next alarm:`, error);
                }
            } else {
                console.log(`🏁 No more future alarms to set`);
            }
        }
    }



    // Simple sendEmail function (duplicate from main.js to avoid dependencies)
    async sendEmail(apiKey, to, subject, content) {
        const msg = {
            personalizations: [{
                to: [{ email: to }]
            }],
            from: { email: 'hello@scribbl.it' },
            subject: subject,
            content: [{
                type: 'text/plain',
                value: content
            }]
        };

        const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(msg)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`SendGrid API error: ${errorText}`);
        }
    }
} 