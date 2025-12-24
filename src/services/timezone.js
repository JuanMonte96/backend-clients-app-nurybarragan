import { DateTime } from "luxon";

const DEFAULT_TZ = "Europe/Paris";

export const localToUTC = (dateString, timeString, tz = DEFAULT_TZ) => {
    const dt = DateTime.fromFormat(`${dateString} ${timeString}`,'yyyy-MM-dd HH:mm', { zone: tz });
    if(!dt.isValid) throw new Error('Invalid date/time')
    return dt.toUTC();
};

export const utcToLocal = (utcDate, tz = DEFAULT_TZ)=> {
    const dt = DateTime.fromJSDate(utcDate, { zone: 'utc' }).setZone(tz);
    if(!dt.isValid) throw new Error('Invalid date/time')
    return {
        date : dt.toFormat('yyyy-MM-dd'),
        time : dt.toFormat('HH:mm'),    
        full : dt.toISO()
    };
};

export const getNowInTimeZone = (tz = DEFAULT_TZ) => DateTime.now().setZone(tz).toJSDate();

export const isTimeWithinRange = (nowUTC, startUTC, endUTC) => {
    const now = DateTime.fromJSDate(nowUTC, {zone: 'utc'});
    const start = DateTime.fromJSDate(startUTC, {zone: 'utc'});
    const end = DateTime.fromJSDate(endUTC, {zone: 'utc'});
    return now >= start && now <= end
}

export const extractDateAndTime = (luxonDateTime)=> {
    return {
        date: luxonDateTime.toFormat('yyyy-MM-dd'),
        time: luxonDateTime.toFormat('HH:mm')
    }
};