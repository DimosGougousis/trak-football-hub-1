package com.academy.tiers.common;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.temporal.IsoFields;
import java.time.temporal.TemporalAdjusters;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** An ISO week such as {@code 2027-W23}, Monday to Sunday. */
public record IsoWeek(LocalDate monday) {

    private static final Pattern FORMAT = Pattern.compile("^(\\d{4})-W(\\d{2})$");

    public static IsoWeek parse(String text) {
        Matcher m = text == null ? null : FORMAT.matcher(text);
        if (m == null || !m.matches()) throw new IllegalArgumentException("ISO week must look like 2027-W23: " + text);
        int week = Integer.parseInt(m.group(2));
        if (week < 1 || week > 53) throw new IllegalArgumentException("ISO week out of range: " + text);
        LocalDate monday = LocalDate.of(Integer.parseInt(m.group(1)), 1, 4)
            .with(IsoFields.WEEK_OF_WEEK_BASED_YEAR, week)
            .with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
        return new IsoWeek(monday);
    }

    public static IsoWeek containing(LocalDate day) {
        return new IsoWeek(day.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY)));
    }

    public LocalDate sunday() {
        return monday.plusDays(6);
    }

    @Override
    public String toString() {
        return monday.get(IsoFields.WEEK_BASED_YEAR) + "-W" + String.format("%02d", monday.get(IsoFields.WEEK_OF_WEEK_BASED_YEAR));
    }
}
