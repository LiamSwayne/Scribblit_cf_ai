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