const asText = (value) => (typeof value === 'string' ? value : '');
/** Script-only cron jobs run a shell script on schedule with no LLM prompt. */
export function jobIsScriptOnly(job) {
    return Boolean(job.no_agent) && Boolean(asText(job.script).trim());
}
export function validateCronEditor(input) {
    const trimmedPrompt = input.prompt.trim();
    const trimmedSchedule = input.schedule.trim();
    if (!trimmedSchedule && !trimmedPrompt && !input.scriptOnlyJob) {
        return 'prompt_and_schedule';
    }
    if (!trimmedSchedule) {
        return 'schedule';
    }
    if (!input.scriptOnlyJob && !trimmedPrompt) {
        return 'prompt';
    }
    return null;
}
/** Build the API update payload, preserving an empty prompt on script-only jobs. */
export function cronEditorUpdates(values, options) {
    const updates = {
        deliver: values.deliver,
        name: values.name,
        schedule: values.schedule.trim()
    };
    const trimmedPrompt = values.prompt.trim();
    if (!options.scriptOnlyJob || trimmedPrompt) {
        updates.prompt = trimmedPrompt;
    }
    return updates;
}
