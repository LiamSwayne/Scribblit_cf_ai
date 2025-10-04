Scribblit is a full-stack web app built on Cloudflare Workers, D1, Durable Objects, Pages, and AI. The app takes in a natural language request, and converts it to an "Entity", which is either a task, calendar event, or reminder. I wrote my own front-end database interface for this project, and wrote my own client-side, runtime JS typechecker.

Visit https://scribbl.it/ to view the simplified page. Reload the page once to view the full UI.

I wrote my own asset-caching layer for this project. Assets that haven't been fetched before are loaded via CDN, and are stored locally on all subsequent page loads. This reduces the load speed from 900ms to 500ms. Fonts are loaded using this cache layer as well. Although this web-app is 25000+ lines and almost all functionality has been offloaded to the front-end, the load speed is still under a second because it was designed with performance in mind.

The back-end uses a combination of Cloudflare, Anthropic, Cerebras, Gemini, and xAi inference. The families of models used are Qwen3, Claude 4, Llama 3, and Gemini 2.5. Depending on the task, some models are run in parallel.

Try it out by typing in the input box in the top left!

Here are some examples to try:
```
report due every tuesday and thursday
```

This is an overwhelming, complex request that the model is still capable of handling:
```
meeting with math teacher on tuesday
meeting with advisor today
math HW due 6 pm today!!!
networking at the gates hillman super hill center from 3 to 10
bio lab on friday
finish recording new song by tomorrow
programming homework before 3pm friday
remind me to buy carrots from target
study session starting at 5:00
studying from 1 pm to 3:25
writing assignment due yesterday
studying from 7 to 8
meet up with omar for 20 minutes from 7:30
cycling club from 7 to 8
remind Bill to pick up cold medicine
meeting every friday
meeting every thursday at 4
no phone tmie every friday at 9pm to monday at 6 am
festival for the entire weekend
```
Inputing something like the content above into Google Calendar would take ten minutes, but it takes less than a minute with Scribblit.
