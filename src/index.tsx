import React from 'react';
import ReactDOM from 'react-dom';
import './index.css';
import App from './App';
import * as serviceWorker from './serviceWorker';
import DatasourceManager from './model/datasource/manager';
import SpanGroupingManager from './model/span-grouping/manager';
import SpanColoringManager from './components/color/span-coloring-manager';


async function main() {
    await Promise.all([
        DatasourceManager.getSingleton().init(),
        SpanGroupingManager.getSingleton().init(),
        SpanColoringManager.getSingleton().init(),
    ]);

    ReactDOM.render(<App />, document.getElementById('root'));
}
main().catch(err => console.error(err))



// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: https://bit.ly/CRA-PWA
serviceWorker.unregister();
