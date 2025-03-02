
async function testContinously() {
    while (true) {
        await sleep(0.1);

        let columns = numberOfColumns();
        ASSERT(Number.isInteger(columns), "numberOfColumns must return integer");
        ASSERT(columns >= 1 && columns <= 4, "numberOfColumns value out of range 1-4");
    }
}

testContinously();