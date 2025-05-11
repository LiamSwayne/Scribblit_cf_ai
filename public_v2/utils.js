function ASSERT(condition, message="") {
    if (typeof(condition) != "boolean") {
        console.error('MALFORMED ASSERTION');
    }
    if (!condition) {
        if (message == "") {
            console.error('ASSERTION FAILED');
        } else {
            console.error('ASSERTION FAILED: ' + message);
        }
        console.trace();
    }
}

const NULL = Symbol('NULL');

function exists(obj) {
    return obj != null && obj != undefined;
}

// async/await sleep function like Python's
function sleep(seconds) {
    return new Promise(resolve => setTimeout(resolve, seconds * 1000)); // setTimeout works in milliseconds
}

// List type for homogeneous arrays
class List {
    constructor(innerType) {
        ASSERT(exists(innerType));
        // innerType can be a constructor or another List
        ASSERT(typeof innerType === 'function' || innerType instanceof List);
        this.innertype = innerType;
    }
}

// Convenience alias for creating list type without 'new'
function LIST(innerType) {
    return new List(innerType);
}