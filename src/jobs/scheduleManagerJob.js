import cron from 'node-cron'
import { db } from '../models/db.js'
import { DateTime } from "luxon";
import { Op } from "sequelize";
import { extractDateAndTime } from "../services/timezone.js";


export const startScheduleManager = () => {
    cron.schedule("*/5* * * * * * * * *", async () => {
        console.log("[CRON] Checking Schedules...")

        const nowUTC = new Date();
        try {

            const schedulesToClose = await db.ClassSchedule.findAll({
                where: {
                    is_active: true,
                    end_timestamp: {
                        [Op.lte]: nowUTC
                    }
                }
            })

            for (const schedule of schedulesToClose) {
                await schedule.update({ is_active: false })

                if (!schedule.id_template) continue

                const template = await db.ClassScheduleTemplate.findByPk(
                    schedule.id_template)

                if (!template || !template.is_enabled) continue

                const nextStart = DateTime
                    .fromJSDate(schedule.start_timestamp, { zone: "utc" })
                    .plus({ days: template.interval_days });

                const nextEnd = DateTime
                    .fromJSDate(schedule.end_timestamp, { zone: "utc" })
                    .plus({ days: template.interval_days });

                const { date: nextDateDB, time: nextStartTimeDB } =
                    extractDateAndTime(nextStart);

                const { time: nextEndTimeDB } =
                    extractDateAndTime(nextEnd);

                const existingInstance = await ClassSchedule.findOne({
                    where: {
                        template_id: template.id_template,
                        start_timestamp: nextStart.toJSDate()
                    }
                });

                if (existingInstance) continue;

                await ClassSchedule.create({
                    id_class: schedule.id_class,
                    template_id: template.id_template,
                    date_class: nextDateDB,
                    start_time: nextStartTimeDB,
                    end_time: nextEndTimeDB,
                    time_zone: schedule.time_zone,
                    start_timestamp: nextStart.toJSDate(),
                    end_timestamp: nextEnd.toJSDate(),
                    is_active: true
                });

            }

        } catch (error) {
            console.error("[CRON ERROR]", error);
        }
    })

}
