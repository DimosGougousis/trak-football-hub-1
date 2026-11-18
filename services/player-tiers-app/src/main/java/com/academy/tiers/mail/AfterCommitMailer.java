package com.academy.tiers.mail;

import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.util.Map;

/**
 * Sends an email only after the surrounding transaction commits, so a parent is
 * never told about an onboarding or a message that was rolled back.
 */
@Component
public class AfterCommitMailer {

    private final Mailer mailer;

    public AfterCommitMailer(Mailer mailer) {
        this.mailer = mailer;
    }

    public void send(String to, String template, Map<String, Object> model) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    mailer.send(to, template, model);
                }
            });
        } else {
            mailer.send(to, template, model);
        }
    }
}
