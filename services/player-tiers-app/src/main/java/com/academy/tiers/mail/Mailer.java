package com.academy.tiers.mail;

import java.util.Map;

/** Outbound email. Templates are named; the model fills them. */
public interface Mailer {
    void send(String to, String template, Map<String, Object> model);
}
