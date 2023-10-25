// @flow
// Test file that ensures flow correctly type checks

function square(n: number): number {
    return n * n;
}
  
// square("2"); // Error!
square(2); // This should work :)