package com.academy.tiers.progression;

import com.academy.tiers.common.ApiException;
import com.academy.tiers.roster.RosterAccess;
import com.academy.tiers.security.CurrentUser;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
public class ProgressionController {

    private final TestResultService tests;
    private final DrillService drills;
    private final ProgressService progress;
    private final RosterAccess access;
    private final SkillTreeService skillTree;

    public ProgressionController(TestResultService tests, DrillService drills, ProgressService progress, RosterAccess access,
                                 SkillTreeService skillTree) {
        this.tests = tests;
        this.drills = drills;
        this.progress = progress;
        this.access = access;
        this.skillTree = skillTree;
    }

    /** CP-03: the coach signs off a Skill Tree node. 201 the first time, 200 if it was already signed off. */
    @PostMapping("/players/{playerId}/skill-tree/{node}/complete")
    ResponseEntity<Map<String, Object>> completeNode(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID playerId,
                                                     @PathVariable String node) {
        var result = skillTree.complete(CurrentUser.of(jwt), playerId, node);
        var status = result == SkillTreeService.Result.COMPLETED ? HttpStatus.CREATED : HttpStatus.OK;
        return ResponseEntity.status(status).body(Map.of("node", node, "completed", true));
    }

    @PostMapping("/players/{playerId}/tests")
    @ResponseStatus(HttpStatus.CREATED)
    Map<String, Object> sign(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID playerId,
                             @RequestBody TestResultService.SignRequest req) {
        return Map.of("attributes_changed", tests.sign(CurrentUser.of(jwt), playerId, req));
    }

    /** 201 when XP is awarded, 200 for a duplicate, 429 when the daily cap is reached (the drill still counts). */
    @PostMapping("/players/{playerId}/drills")
    ResponseEntity<Map<String, Object>> drill(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID playerId,
                                              @RequestBody DrillService.DrillRequest req) {
        var logged = drills.log(CurrentUser.of(jwt), playerId, req);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("xp_awarded", logged.xpAwarded());
        body.put("xp_today", logged.xpToday());
        body.put("attributes_changed", List.of());
        return switch (logged.outcome()) {
            case AWARDED -> ResponseEntity.status(HttpStatus.CREATED).body(body);
            case DUPLICATE -> { body.put("duplicate", true); yield ResponseEntity.ok(body); }
            case CAPPED -> { body.put("error", "daily_xp_cap"); yield ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS).body(body); }
        };
    }

    @GetMapping("/players/{playerId}/progress")
    ProgressService.Progress progress(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID playerId) {
        if (!access.canSee(CurrentUser.of(jwt), playerId)) throw ApiException.forbidden();
        return progress.of(playerId);
    }
}
