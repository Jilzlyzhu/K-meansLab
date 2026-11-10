'use strict';
const {chromium}=require('playwright');
module.exports.launchBrowser=()=>chromium.launch({headless:true,...(process.env.TEST_BROWSER_EXECUTABLE?{executablePath:process.env.TEST_BROWSER_EXECUTABLE}:{})});
