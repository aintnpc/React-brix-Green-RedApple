// WeakRef polyfill - must be loaded before any navigation libraries
if (typeof WeakRef === 'undefined') {
  global.WeakRef = class WeakRef {
    constructor(target) { this._target = target }
    deref() { return this._target }
  }
}
