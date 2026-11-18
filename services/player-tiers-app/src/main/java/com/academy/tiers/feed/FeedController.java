package com.academy.tiers.feed;

import com.academy.tiers.common.ApiException;
import com.academy.tiers.common.IsoWeek;
import com.academy.tiers.security.CurrentUser;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class FeedController {

    private final FeedService feed;

    public FeedController(FeedService feed) {
        this.feed = feed;
    }

    /** The calling parent's children only. Defaults to the current ISO week. */
    @GetMapping("/parents/me/feed")
    FeedService.Feed myFeed(@AuthenticationPrincipal Jwt jwt, @RequestParam(required = false) String week) {
        var caller = CurrentUser.of(jwt);
        if (!caller.is("parent")) throw ApiException.forbidden();
        IsoWeek w;
        try {
            w = week == null ? feed.currentWeek() : IsoWeek.parse(week);
        } catch (IllegalArgumentException e) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "invalid_week");
        }
        var result = feed.forParent(caller.id(), w);
        if (result.players().isEmpty()) throw new ApiException(HttpStatus.NOT_FOUND, "no_linked_player");
        return result;
    }
}
