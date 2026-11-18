package com.academy.tiers.messaging;

import com.academy.tiers.security.CurrentUser;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
public class MessagingController {

    record BlockRequest(UUID coachId) {}

    private final MessageService messages;

    public MessagingController(MessageService messages) {
        this.messages = messages;
    }

    /** The request names the player only; the server adds every recipient. */
    @PostMapping("/messages")
    @ResponseStatus(HttpStatus.CREATED)
    MessageService.Sent send(@AuthenticationPrincipal Jwt jwt, @RequestBody MessageService.SendRequest req) {
        return messages.send(CurrentUser.of(jwt), req);
    }

    @GetMapping("/players/{playerId}/messages")
    List<MessageService.Message> thread(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID playerId) {
        return messages.thread(CurrentUser.of(jwt), playerId);
    }

    @PostMapping("/players/{playerId}/contact-block")
    @ResponseStatus(HttpStatus.CREATED)
    Map<String, Object> block(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID playerId, @RequestBody BlockRequest req) {
        messages.block(CurrentUser.of(jwt), playerId, req.coachId());
        return Map.of("player_id", playerId, "coach_id", req.coachId(), "contact", "revoked");
    }
}
