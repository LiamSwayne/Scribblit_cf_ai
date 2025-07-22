# 🧪 Alarm System Testing Guide

## Quick Tests

### 1. **Immediate Deployment Check**
```bash
cd private_v2/server
npx wrangler deploy
```
✅ Should see: "Successfully published your worker"

### 2. **Create Test Alarm (2 minutes)**
1. Open your Scribblit app
2. Create reminder: "Test alarm - 2 min test"
3. Set time: 2 minutes from now
4. Save it
5. **Watch your email in 2 minutes!**

### 3. **Monitor Real-time Logs**
```bash
cd private_v2/server
npx wrangler tail
```

You should see logs like:
```
Setting 1 alarms for user: your@email.com
Successfully set 1 alarms for your@email.com
```

When alarm fires (2 minutes later):
```
Alarm fired at 2025-01-14T10:15:00.000Z
Sending notification for: Test alarm - 2 min test to your@email.com
Notification sent successfully for Test alarm - 2 min test
```

## 4. **Check Cloudflare Dashboard**

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Workers & Pages → Your worker → Durable Objects
3. You should see `AlarmManager` instances (one per user)

## 5. **Test Complete Flow**

### Step-by-Step Verification:

**A. Create Alarm**
- Create reminder for 3 minutes from now
- Check logs: Should see "Setting X alarms for user: email"

**B. Update User Data**  
- Modify any other reminder/task
- Check logs: Should see alarms cleared and reset

**C. Wait for Alarm**
- Wait 3 minutes
- Check logs: Should see "Alarm fired" and "Notification sent"
- **Check your email!**

## 6. **Debugging Commands**

### View Live Logs
```bash
npx wrangler tail --format pretty
```

### Check Durable Object Status
```bash
npx wrangler kv:namespace list  # See if DO namespaces exist
```

### Force Deploy (if issues)
```bash
npx wrangler deploy --force
```

## 7. **What You Should See**

### ✅ **Working Correctly:**
- Logs show "Setting X alarms for user"
- Logs show "Alarm fired" at correct time  
- Email arrives precisely when expected
- Updating user data clears/resets alarms

### ❌ **Common Issues:**
- **No logs**: Deployment failed, check wrangler.toml
- **Alarm doesn't fire**: Check time zones, wait longer
- **No email**: Check SendGrid API key, spam folder
- **Error in logs**: Check alarm data format

## 8. **Advanced Testing**

### Test Multiple Alarms
```javascript
// Create several reminders:
// - 1 minute from now
// - 5 minutes from now  
// - 1 hour from now
// Should see all alarms set and fire correctly
```

### Test Alarm Invalidation
```javascript
// 1. Create reminder for 10 minutes from now
// 2. Wait 2 minutes  
// 3. Update any user data (add new task)
// 4. Should see old alarms cleared, new ones set
```

## 9. **Sample Log Output**

**Good deployment:**
```
✅ Setting 3 alarms for user: test@example.com
✅ Successfully set 3 alarms for test@example.com
```

**Alarm firing:**
```
⏰ Alarm fired at 2025-01-14T15:30:00.000Z
📧 Sending notification for: Important meeting reminder to test@example.com  
✅ Notification sent successfully for Important meeting reminder
```

**User data update:**
```
🔄 All alarms cleared
✅ Setting 5 alarms for user: test@example.com
✅ Successfully set 5 alarms for test@example.com
```

## 10. **Troubleshooting**

**No alarms being set?**
- Check frontend: `generateAlarmTableForServer()` returning empty array?
- Check backend: Is `alarmTable` being received?

**Alarms not firing?**
- Check Cloudflare dashboard for Durable Object instances
- Verify time zones (all times should be UTC)
- Wait a bit longer (up to 1 minute delay is normal)

**No emails?**
- Check SendGrid API key in secrets
- Check spam folder
- Verify sender email (hello@scribbl.it) is authorized

---

## Quick Test Right Now! 🚀

1. **Create test reminder** for 2 minutes from now
2. **Run:** `npx wrangler tail` 
3. **Wait and watch** logs + your email

If you see logs and get an email in 2 minutes, everything is working perfectly! 🎉 