package com.academy.tiers.mail;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.Map;

/**
 * Default mailer for Milestones 1-3: it records that an email would be sent and
 * sends nothing (ADR-004 guardrail: no real email to parents yet). It logs the
 * template and the recipient's domain only, never the address or the content.
 */
@Component
public class LoggingMailer implements Mailer {

    private static final Logger log = LoggerFactory.getLogger(LoggingMailer.class);

    @Override
    public void send(String to, String template, Map<String, Object> model) {
        String domain = to.contains("@") ? to.substring(to.indexOf('@') + 1) : "?";
        log.info("mail not sent (no provider configured): template={} recipient_domain={}", template, domain);
    }
}
