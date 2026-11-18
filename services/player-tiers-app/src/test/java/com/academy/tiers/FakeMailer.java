package com.academy.tiers;

import com.academy.tiers.mail.Mailer;
import org.springframework.context.annotation.Primary;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

/** Records every email instead of sending it. Tests read it by recipient and template, and can make one address fail. */
@Component
@Primary
public class FakeMailer implements Mailer {

    public record Sent(String to, String template, Map<String, Object> model) {}

    private final List<Sent> sent = new CopyOnWriteArrayList<>();
    private final Set<String> failing = ConcurrentHashMap.newKeySet();

    @Override
    public void send(String to, String template, Map<String, Object> model) {
        if (failing.contains(to.toLowerCase())) throw new IllegalStateException("simulated mail failure for " + to);
        sent.add(new Sent(to.toLowerCase(), template, Map.copyOf(model)));
    }

    public List<Sent> sentTo(String to, String template) {
        return sent.stream()
            .filter(s -> s.to().equals(to.toLowerCase()) && s.template().equals(template))
            .toList();
    }

    public void failFor(String to) { failing.add(to.toLowerCase()); }

    public void recover(String to) { failing.remove(to.toLowerCase()); }
}
