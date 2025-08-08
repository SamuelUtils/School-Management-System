// Example of a simple unit test
function add(a: number, b: number): number {
    return a + b;
}

describe('Example Unit Test', () => {
    it('should add two numbers correctly', () => {
        expect(add(1, 2)).toBe(3);
    });
});