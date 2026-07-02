import { runPostImportRefresh } from './dataio/postImportRefresh.js';
import { dataIoSupportMethods } from './dataio/support.js';
import { dataIoImportMethods } from './dataio/importExport.js';

export { runPostImportRefresh };

export class DataIOModule {
    constructor(app) {
        this.app = app;
        this.data = app.data;
        this._importInFlight = false;
        this.bindEvents();
    }
}

Object.assign(DataIOModule.prototype, dataIoSupportMethods, dataIoImportMethods);
